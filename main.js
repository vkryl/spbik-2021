/**
 Source code of the bot running at https://t.me/spbik_bot
 Available in Russian and English languages.

 Sample project of what could be built based on
 the generated JSON files located inside /data folder.

 Copyright © Vyacheslav <slavone@protonmail.ch> (https://github.com/vkryl) 2021–2022

 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU Lesser General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Lesser General Public License for more details.

 You should have received a copy of the GNU Lesser General Public License
 along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

'use strict';

// CONSTANTS

const VERSION = '3.72';
const CHARTS_VERSION = '1.17';

const REGION_NAME = 'st-petersburg';
const REGION_CODE = 78;
const VIOLATIONS_URL = 'https://www.kartanarusheniy.org/2021-09-19/s/3405541806';
const COMMITTEE_URL = 'http://cikrf.ru/iservices/voter-services/committee';

const IZBIRKOM_HOST = 'www.' + REGION_NAME + '.vybory.izbirkom.ru';

const REGIONS = {};

// TELEGRAM BOT

const isDebug = process.platform === 'darwin';
process.env.NTBA_FIX_319 = 1;
process.env.NTBA_FIX_350 = 1;

// LIBRARIES

require('format-unicorn');
const fs = require('fs'),
  http = require('http'),
  path = require('path'),
  https = require('https'),
  iconv = require('iconv-lite'),
  moment = require('moment'),
  geolib = require('geolib'),
  XPath = require('xpath'),
  DOMParser = require('xmldom').DOMParser,
  hasClass = require('xpath-has-class'),
  {Canvas, CanvasRenderingContext2D, FontLibrary, loadImage, Path2D} = require('skia-canvas'),
  { fillTextWithTwemoji, measureText } = require('skia-canvas-with-twemoji-and-discord-emoji'),
  TelegramBot = require('node-telegram-bot-api'),
  ProxyLists = require('proxy-lists'),
  SocksProxyAgent = require('socks-proxy-agent'),
  HttpProxyAgent = require('http-proxy-agent'),
  HttpsProxyAgent = require('https-proxy-agent'),
  imageToAscii = require('image-to-ascii'),
  readline = require('readline'),
  tesseract = require('node-tesseract-ocr'),
  fakeUa = require('fake-useragent'),
  level = require('level'),
  Duration = require('duration'),
  tor = require('tor-request'),
  I18n = require('i18n').I18n;

const settings = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'UTF-8'));

const TELEGRAM_API_TOKEN = process.env.TELEGRAM_API_TOKEN || settings.tokens[isDebug ? 'debug' : 'production'];

const i18n = new I18n({
  locales: ['ru', 'en'],
  fallbacks: { ua: 'ru', be: 'ru' },
  defaultLocale: 'ru',
  retryInDefaultLocale: true,

  autoReload: true,

  header: 'locale',
  directory: path.join(__dirname, 'locales'),
  updateFiles: false,
  objectNotation: true,
  preserveLegacyCase: false,

  logDebugFn: (msg) => {
    console.log('debug', msg)
  },

  // setting of log level WARN - default to require('debug')('i18n:warn')
  logWarnFn: (msg) => {
    console.warn('warn', msg)
  },

  // setting of log level ERROR - default to require('debug')('i18n:error')
  logErrorFn: (msg) => {
    console.error('error', msg)
  }
});

const TOR_PROXY_URL = 'socks5://localhost:9050';

const CM = [];
const solvedCaptcha = {};
const USER_AGENT = fakeUa();

for (let i = 0; i < 1; i++) {
  CM.push({});
}

// HTTP(S)

const allHostsStats = {};
let proxyBlacklist = {};

function setProxyAgent (options, proxyUrl) {
  if (!proxyUrl) {
    delete options.agent;
    return;
  }
  let agent = null;
  const proxyProtocol = new URL(proxyUrl).protocol;
  switch (proxyProtocol) {
    case 'socks4:':
    case 'socks5:':
      agent = new SocksProxyAgent(proxyUrl);
      break;
    case 'http:':
      agent = new HttpProxyAgent(proxyUrl);
      break;
    case 'https:':
      agent = new HttpsProxyAgent(proxyUrl);
      break;
    default:
      throw Error('Unknown proxy protocol: ' + proxyProtocol);
  }
  options.agent = agent;
}

function httpGet (rawUrl, contentTypeFilter, logInfo) {
  return new Promise((accept, reject) => {
    let url = null;
    try {
      url = new URL(rawUrl);
    } catch (e) {
      throw Error('Cannot parse ' + JSON.stringify(rawUrl), e);
    }
    if (!allHostsStats[url.host]) {
      allHostsStats[url.host] = {
        requests: 0,
        captchas: {
          // proxyData -> request_no
          // 0 = no captcha, 1 = 1st request
          no_proxy: 0
        },
        current_proxy: url.host.endsWith('izbirkom.ru') || url.host.endsWith('cikrf.ru') ? TOR_PROXY_URL : null
      };
    }
    const hostStats = allHostsStats[url.host];
    const requestNo = ++hostStats.requests;

    const requestOptions = {
      host: url.host,
      path: url.pathname + url.search
    };
    setProxyAgent(requestOptions, hostStats.current_proxy);

    const protocol = url.protocol === 'https:' ? https : http;
    console.log('Fetching', rawUrl, '->', logInfo, 'Proxy:', hostStats.current_proxy ? hostStats.current_proxy : 'no', 'request_no:', requestNo);
    const onError = (e) => {
      console.log(e);
      reject(e);
    };
    const fetchHttp = (url, callback, needBinary) => {
      const parsed = new URL(url);
      const protocol = (parsed.protocol === 'https:' ? https : http);
      try {
        protocol.get(applyCookie(requestNo, rawUrl, {
          host: parsed.host,
          path: parsed.pathname + parsed.search
        }), (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(res);
            return;
          }
          storeCookie(requestNo, url, res);
          toUtf8(res, (contentType, content) => {
            callback(content, res.statusCode);
          }, needBinary);
        }).on('error', onError);
      } catch (e) {
        console.error('Cannot fetch', url, e);
      }
    };
    const onDone = (text, retryWithProxy, invalidCaptcha, forceCaptchaFlow) => {
      if (!responseCallback)
        throw Error();
      if (invalidCaptcha || (url.host.endsWith('izbirkom.ru') && text.includes('<input id="captcha" name="captcha"'))) {
        // Try to solve
        const captcha = invalidCaptcha || generateCaptchaId(requestNo);
        console.log('Received captcha for', rawUrl, 'request_no:', requestNo);
        if (hostStats.current_proxy === TOR_PROXY_URL) {
          console.log('Switching identity...');
          clearCookies(requestNo);
          tor.newTorSession((err) => {
            if (err) {
              console.log('Failed to switch identity', err);
            } else {
              console.log('Identity switched');
              console.log('Retrying', rawUrl, '->', logInfo, 'Proxy:', hostStats.current_proxy ? hostStats.current_proxy : 'no');
              protocol.get(applyCookie(requestNo, rawUrl, requestOptions), responseCallback).on('error', onError);
            }
          });
          return;
        }
        fetchHttp('http://' + url.host + '/captcha-service/image/?d=' + captcha.id, (captchaImageBinary) => {
          fs.writeFileSync(path.join('cache', 'captcha.png'), captchaImageBinary);
          const onCaptchaGuessMade = (captchaGuess) => {
            imageToAscii(captchaImageBinary, {
              size: {width: 85, height: 85},
              colored: false
            }, (err, converted) => {
              console.log(err || converted);
              if (err) {
                onDone(text, false, null, true);
                return;
              }
              let rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
              });
              const onCaptchaSolved = (captchaCode, cached) => {
                console.log('Captcha solution:', captchaCode.startsWith('0') ? captchaCode : parseInt(captchaCode), 'request_no:', requestNo);
                fetchHttp('http://' + url.host + '/validate/captcha/value/' + captchaCode, (validationResponse, validationResponseCode) => {
                  if (validationResponseCode === 401 || validationResponse.includes('id="captcha"')) {
                    console.log('Invalid captcha, retrying', validationResponseCode);
                    rl = readline.createInterface({
                      input: process.stdin,
                      output: process.stdout
                    });
                    rl.question('Invalid captcha, try again (guess: ' + captchaGuess + '): ', captchaCallback);
                  } else {
                    protocol.get(applyCookie(requestNo, rawUrl, requestOptions), responseCallback).on('error', onError);
                  }
                }, false, contentTypeFilter);
              };
              const captchaCallback = (captchaCode) => {
                rl.close();
                captchaCode = captchaCode.trim();
                if (!captchaCode) {
                  clearCookies(requestNo);
                  protocol.get(applyCookie(requestNo, rawUrl, requestOptions), responseCallback).on('error', onError);
                  return;
                }
                if (captchaCode.match(/^[0-9]{4,6}$/gi)) {
                  captcha.solution = captchaCode;
                  onCaptchaSolved(captchaCode);
                } else {
                  if (captchaCode === 'clear') {
                    clearCookies(requestNo);
                  } else if (captchaCode === 'tor') {
                    clearCookies(requestNo);
                    const retryWithTor = () => {
                      console.log('Retrying', rawUrl, '->', logInfo, 'Proxy:', hostStats.current_proxy ? hostStats.current_proxy : 'no');
                      protocol.get(applyCookie(requestNo, rawUrl, requestOptions), responseCallback).on('error', onError);
                    };
                    if (hostStats.current_proxy !== TOR_PROXY_URL) {
                      setProxyAgent(requestOptions, TOR_PROXY_URL);
                      hostStats.current_proxy = TOR_PROXY_URL
                      retryWithTor();
                    } else {
                      tor.newTorSession((err) => {
                        if (err) {
                          console.log(err);
                        } else {
                          retryWithTor();
                        }
                      });
                      return;
                    }
                  } else {
                    console.log('Invalid value entered.', captchaCode);
                  }
                  rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                  });
                  rl.question('Please solve captcha (guess: ' + captchaGuess + '): ', captchaCallback);
                }
              };
              rl.question('Please solve captcha (guess: ' + captchaGuess + '): ', captchaCallback);
            });
          };
          tesseract.recognize(captchaImageBinary, {
            tessedit_char_whitelist: '0123456789',
            oem: 1, psm: 7
          }).then((text) => {
            onCaptchaGuessMade(text.trim());
          }).catch((error) => {
            console.log(error.message);
            onCaptchaGuessMade(null);
          });
        }, true);
        return;
      } else if (retryWithProxy) {
        const captchaKey = hostStats.current_proxy ? hostStats.current_proxy : 'no_proxy';
        hostStats.captchas[captchaKey] = requestNo;
        console.log(retryWithProxy ? 'Error' : 'Captcha', 'occurred for', captchaKey, 'on request #' + requestNo + '. Trying to find a new proxy...');
        if (hostStats.current_proxy) {
          if (!proxyBlacklist[url.host]) {
            proxyBlacklist[url.host] = [];
          }
          proxyBlacklist[url.host].push(hostStats.current_proxy);
          saveJsonFile(path.join('cache', 'proxy_blacklist.json'), proxyBlacklist);
        }
        const proxyProtocols = ['socks5'];
        let retriedWithNewProxy = false;
        ProxyLists.getProxies({
          countries: ['ru'],
          protocols: proxyProtocols
        }).on('data', (proxies) => {
          if (retriedWithNewProxy)
            return;
          console.log('Received', proxies.length, 'proxies, looking whether there is a good one');
          for (let proxyIndex = 0; proxyIndex < proxies.length; proxyIndex++) {
            const proxy = proxies[proxyIndex];
            if (!proxy.protocols)
              continue;
            const proxyProtocol = proxy.protocols.sort((a, b) => {
              const index1 = proxyProtocols.indexOf(a);
              const index2 = proxyProtocols.indexOf(b);

              const has1 = index1 != -1;
              const has2 = index2 != -1;

              if (has1 != has2) {
                return has1 ? -1 : 1;
              }
              if (has1) {
                return index1 < index2 ? -1 : 1;
              }
              return a < b ? -1 : a > b ? 1 : 0;
            })[0];
            const proxyData = proxyProtocol + '://' + proxy.ipAddress + ':' + proxy.port;
            if (proxyBlacklist[url.host] && proxyBlacklist[url.host].includes(proxyData)) {
              continue;
            }
            if (!hostStats.captchas[proxyData]) {
              try {
                setProxyAgent(options, proxyData);
                hostStats.current_proxy = proxyData;
                retriedWithNewProxy = true;
                console.log('Retrying', rawUrl, '->', logInfo, 'Proxy:', hostStats.current_proxy ? hostStats.current_proxy : 'no');
                protocol.get(applyCookie(requestNo, rawUrl, options), responseCallback).on('error', onError);
                break;
              } catch (e) {
                console.log('Error occurred when trying to set proxy', e, 'retried:', retriedWithNewProxy);
                throw e;
              }
            }
          }
          if (!retriedWithNewProxy) {
            console.log('None of the proxies matches the criteria, waiting for new ones..');
          }
        })
          .on('error', (error) => {
            if (!retriedWithNewProxy) {
              reject(error);
            }
          })
          .once('end', () => {
            if (!retriedWithNewProxy) {
              reject('No valid proxies found!');
            }
          });
      } else {
        accept(text);
      }
    };
    const responseCallback = (res) => {
      storeCookie(requestNo, rawUrl, res);
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(res);
        return;
      }
      toUtf8(res, (contentType, content) => {
        if (content && contentTypeFilter && !contentTypeFilter.includes(contentType[0])) {
          reject('Invalid content-type: ' + res.headers['content-type']);
        } else {
          onDone(content);
        }
      });
    };
    protocol.get(applyCookie(requestNo, rawUrl, requestOptions), responseCallback).on('error', onError);
  });
}

function generateCaptchaId (requestNo) {
  const newCaptchaId = Date.now();
  const cacheId = requestNo % CM.length;
  return {
    id: newCaptchaId,
    cache_id: cacheId
  };
}

function getCookies (requestNo, url) {
  const host = new URL(url).host;
  const cacheId = requestNo % CM.length;
  if (!CM[cacheId])
    CM[cacheId] = {};
  if (!CM[cacheId][host]) {
    const chars = '0123456789abcdef'.split('');
    let deviceId = '';
    for (let i = 0; i < 32; i++) {
      deviceId += chars[Math.round(Math.random() * (chars.length - 1))]
    }
    CM[cacheId][host] = {
      // 'izbFP': 'XXX',
      //'session-cookie': 'XXX',
      //'JSESSIONID': 'XXX',
      //'izbSession': 'XXX'
    };
  }
  return Object.keys(CM[cacheId][host])
    .map((cookieKey) => cookieKey + '=' + CM[cacheId][host][cookieKey]
    );
}

function storeCookie (requestNo, url, request) {
  const cookie = request.headers['set-cookie'];
  const host = new URL(url).host;
  if (empty(cookie))
    return;

  const before = getCookies(requestNo, url).join('; ');

  const cacheId = requestNo % CM.length;
  if (!CM[cacheId]) {
    CM[cacheId] = {};
  }
  if (!CM[cacheId][host]) {
    CM[cacheId][host] = {};
  }
  cookie.forEach((specificCookie) => {
    const keyValue = specificCookie.split('; ')[0].split('=');
    CM[cacheId][host][keyValue[0]] = keyValue[1];
  });
  const after = getCookies(requestNo, url).join('; ');
  if (before != after) {
    // console.log('Stored', cookie.length, 'cookie', url, 'request_no', requestNo, getCookies(requestNo, url));
  } else {
    // console.log('Unchanged', cookie.length, 'cookie', url, 'request_no', requestNo, getCookies(requestNo, url));
  }
}

function clearCookies (requestNo) {
  CM[requestNo % CM.length] = {};
}

function applyCookie (requestNo, url, options) {
  const cookie = getCookies(requestNo, url);
  if (!options.headers)
    options.headers = {};
  if (!options.headers['User-Agent'])
    options.headers['User-Agent'] = USER_AGENT;
  if (!empty(cookie)) {
    if (!options.headers) {
      options.headers = {};
    }
    options.headers['Cookie'] = cookie.join('; ');
  } else {
    delete options.headers['Cookie'];
  }
  // console.log('Sending', cookie.length, 'cookie', 'request_no', requestNo, cookie, toJson(options));
  return options;
}

function toUtf8 (res, onDone, needBinary) {
  const contentType = (res.headers['content-type'] || '').split(';');
  let encoding = null;
  for (let i = 0; i < contentType.length; i++) {
    const keyValue = contentType[i].split('=');
    if (keyValue.length == 2 && keyValue[0].toLowerCase() == 'charset') {
      encoding = keyValue[1];
    }
  }
  let data = [];
  res.setEncoding('binary');
  res.on('data', (chunk) => {
    data.push(Buffer.from(chunk, 'binary'));
  });
  res.on('end', () => {
    const binary = Buffer.concat(data);
    if (needBinary) {
      onDone(contentType, binary);
    } else {
      if (encoding && encoding != 'UTF-8') {
        onDone(contentType, iconv.encode(iconv.decode(binary, encoding), 'UTF-8'));
      } else {
        onDone(contentType, binary.toString('UTF-8'));
      }
    }
  });
}

// HTML

const htmlCache = {};

function parseHtml (html) {
  let warningCount = 0, errorCount = 0;
  const doc = new DOMParser({
    errorHandler: {
      warning: (msg) => warningCount++,
      error: (msg) => errorCount++,
      fatalError: (msg) => reject(msg)
    }
  }).parseFromString(html);
  if (warningCount > 0 || errorCount > 0) {
    // console.log('Parsed HTML, warnings: ' + warningCount + ', errors: ' + errorCount);
  }
  return doc;
}

async function getHtmlFile (filePath, htmlUrl, noCache) {
  const cached = htmlCache[filePath];
  if (cached) {
    return cached;
  }
  let html = null;
  try {
    html = await readJsonFile(filePath);
    html.document = parseHtml(html.response);
  } catch (e) {
    html = htmlUrl ? await httpGet(htmlUrl, ['text/html'], filePath ? filePath : 'RAM') : null;
    if (html) {
      html = {
        origin: htmlUrl,
        date: Date.now(),
        response: html.toString()
      };
      if (!noCache) {
        htmlCache[filePath] = html;
      }
      const document = parseHtml(html.response);
      const captcha = XPath.select1('//input[@id="captcha"]', document);
      if (captcha)
        throw Error('Captcha occurred on request #' + hostStats[new URL(htmlUrl).host] + ' ' + htmlUrl + ' -> ' + filePath);
      await saveJsonFile(filePath, html);
      html.document = document;
    }
  }
  return html;
}

// JSON

const jsonCache = {};

function toJson (json) {
  return JSON.stringify(json, null, '  ');
}

async function readJsonFile (filePath) {
  if (fs.lstatSync(filePath).isDirectory()) {
    const result = {};
    const files = fs.readdirSync(filePath);
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const fileName = files[fileIndex];
      const key = fileName.replace(/\.json$/gi, '');
      result[key] = await readJsonFile(path.join(filePath, fileName));
    }
    return result;
  }
  return JSON.parse(fs.readFileSync(filePath, 'UTF-8'));
}

async function saveJsonFile (filePath, jsonData) {
  const json = toJson(jsonData);
  const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : null;
  if (dir) {
    fs.mkdirSync(dir, {recursive: true});
  }
  fs.writeFileSync(filePath, json);
}

async function getJsonFile (filePath, jsonUrl, noCache, allowError) {
  const cached = jsonCache[filePath];
  if (cached) {
    return cached;
  }
  let json = null;
  try {
    json = await readJsonFile(filePath);
  } catch (e) {
    if (!jsonUrl)
      throw e;
    let httpResponse = null;
    try {
      httpResponse = await httpGet(jsonUrl, ['application/json', 'application/hal+json'], filePath ? filePath : 'RAM', allowError);
    } catch (e) {
      console.error('Cannot fetch', jsonUrl);
      if (!allowError) {
        throw e;
      }
    }
    json = !httpResponse ? {} : JSON.parse(httpResponse);
    if (json) {
      json = {
        origin: jsonUrl,
        date: Date.now(),
        response: json
      };
      if (!noCache) {
        jsonCache[filePath] = json;
      }
      await saveJsonFile(filePath, json);
    }
  }
  if (json) {
    return json;
  } else {
    throw Error(jsonUrl ? 'Failed to fetch ' + jsonUrl : 'Failed to load ' + filePath);
  }
}

// UTILS

function empty (obj) {
  if (!obj)
    return true;
  if (Array.isArray(obj))
    return obj.length === 0;
  switch (typeof obj) {
    case 'string':
      return obj.length === 0;
    case 'object':
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          return false;
        }
      }
      return true;
  }
  return false;
}

function cloneArray (array) {
  if (!Array.isArray(array))
    throw Error();
  return array.map((a) => a);
}

function sortKeysByValueDesc (object, transformer) {
  return sortKeys(object, transformer, (a, b) => object[b] - object[a]);
}

function formatNumber (number) {
  if (typeof number !== 'number')
    throw Error(toJson(number));
  let str = toDisplayPercentage(number, true);
  if (str.length <= 3 || str.indexOf('.') !== -1)
    return str;
  let result = '';
  let count = 0;
  for (let i = str.length - 1; i >= 0; i--) {
    const digit = str[i];
    if (++count > 3) {
      result = digit + ',' + result;
      count = 1;
    } else {
      result = digit + result;
    }
  }
  return result;
}

function sortKeys (object, transformer, sorter, keyTransformer, filter) {
  const sorted = {};
  let keys = Object.keys(object);
  if (filter) {
    keys = keys.filter(filter);
  }
  keys.sort(sorter).forEach((key) => {
    sorted[keyTransformer ? keyTransformer(key) : key] = transformer ? transformer(object[key]) : object[key];
  });
  return sorted;
}

function countKeys (object) {
  if (object) {
    let count = 0;
    for (const key in object) {
      if (object.hasOwnProperty(key)) {
        count++;
      }
    }
    return count;
  }
  return 0;
}

function countValues (object, transformer) {
  if (object) {
    let count = 0;
    for (const key in object) {
      if (object.hasOwnProperty(key)) {
        count += transformer ? transformer(object[key]) : object[key];
      }
    }
    return count;
  }
  return 0;
}

function arraySum (array, transformer) {
  if (!Array.isArray(array))
    throw Error();
  let result = 0;
  array.forEach((item, index) => {
    result += transformer ? transformer(item, index) : item;
  });
  return result;
}

function arrayMax (array, transformer) {
  if (!Array.isArray(array))
    throw Error();
  let result = null;
  array.forEach((item, index) => {
    let value;
    if (transformer) {
      value = transformer(item, index);
    } else {
      value = item;
    }
    if (value !== null) {
      result = result !== null ? Math.max(value, result) : value;
    }
  });
  return result;
}

function arrayMin (array, transformer) {
  if (!Array.isArray(array))
    throw Error();
  let result = null;
  array.forEach((item, index) => {
    let value;
    if (transformer) {
      value = transformer(item, index);
    } else {
      value = item;
    }
    if (value !== null) {
      result = result !== null ? Math.min(value, result) : value;
    }
  });
  return result;
}

function indexOf (array, object) {
  for (let i = 0; i < array.length; i++) {
    if (equals(array[i], object)) {
      return i;
    }
  }
  return -1;
}

function equals (a, b) {
  if (a === b)
    return true;
  if (typeof a !== typeof b)
    return false;
  if (Array.isArray(a) || Array.isArray(b))
    return arrayEquals(a, b);
  if (typeof a === 'object') {
    if (countKeys(a) !== countKeys(b))
      return false;
    for (let key in a) {
      const aValue = a[key];
      const bValue = b[key];
      if (!equals(aValue, bValue)) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function arrayEquals (a, b) {
  if (a === b)
    return true;
  if (!Array.isArray(a) || !Array.isArray(b))
    return false;
  if (a.length != b.length)
    return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] != b[i])
      return false;
  }
  return true;
}

function clone (obj, excludeKeys) {
  if (!obj) {
    return obj;
  }
  if (Array.isArray(obj)) {
    let newArray = [];
    obj.forEach((element) => {
      newArray.push(clone(element));
    });
    return newArray;
  } else if (typeof obj === 'object') {
    if (typeof excludeKeys === 'string') {
      excludeKeys = [excludeKeys];
    }
    let cloned = {};
    Object.keys(obj).forEach((key) => {
      if (!excludeKeys || !excludeKeys.includes(key)) {
        cloned[key] = clone(obj[key]);
      }
    });
    return cloned;
  } else {
    return obj;
  }
}

function ucfirst (str) {
  return str && str.length ? str.charAt(0).toUpperCase() + str.substring(1) : str;
}

function ucwords (str) {
  return str ? str.split(' ').map((str) => {
    let text = str.toLowerCase();
    return text == 'лдпр' ? str : text.length > 1 ? ucfirst(text) : text;
  }).join(' ') : str;
}

const cyrillicToLatinMap = {
  'А': 'A',
  'Б': 'B',
  'В': 'V',
  'Г': 'G',
  'Д': 'D',
  'Е': 'E',
  'Ё': 'Yo',
  'Ж': 'Zh',
  'З': 'Z',
  'И': 'I',
  'Й': 'Y',
  'К': 'K',
  'Л': 'L',
  'М': 'M',
  'Н': 'N',
  'О': 'O',
  'П': 'P',
  'Р': 'R',
  'С': 'S',
  'Т': 'T',
  'У': 'U',
  'Ф': 'F',
  'Х': 'H',
  'Ц': 'Ts',
  'Ч': 'Ch',
  'Ш': 'Sh',
  'Щ': 'Shch',
  'Ъ': '',
  'Ы': 'Y',
  'Ь': '',
  'Э': 'E',
  'Ю': 'Yu',
  'Я': 'Ya'
};

function venueName (context, address) {
  if (context.isLatinLocale) {
    if (address.type === 'district_administration') {
      return context.__('administration', {district: districtName(context, address.address.district)});
    }
  }
  return address.name.replace(/\s*Санкт-Петербурга$/i, '');
}

function districtName (context, text) {
  if (text === 'Голосование за рубежом') {
    return context.__('abroad');
  }
  text = text.replace(/ район$/i, '');
  return context.__('district', {name: text, name_latin: cyrillicToLatin(text)});
}

function cyrillicToLatin (text) {
  if (!text || !text.length || typeof text !== 'string')
    return text;
  if (text === 'СПбИК') {
    return 'SPBEC';
  }

  text = text.replace(/кс/g, 'x').replace(/ый$/g, 'y').replace(/ий$/, 'y').replace(/ый/g, 'iy');
  let res = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const upperCase = c.toUpperCase();
    const transliterated = cyrillicToLatinMap[upperCase];
    if (transliterated !== undefined) {
      res += (c === upperCase ? transliterated : transliterated.toLowerCase());
    } else {
      res += c;
    }
  }
  return res;
}

function htmldecode (str) {
  return str ? str.replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–') : str;
}

function abbreviation (str) {
  if (str && str.length && str.toUpperCase() != str) {
    return str.split(' ').map((a) => a.charAt(0).toUpperCase()).join('');
  }
  return str;
}

function findEnding (name, endings) {
  for (let i = 0; i < endings.length; i++) {
    if (name.endsWith(endings[i]))
      return endings[i];
  }
  return false;
}

function removeFromSet (target, name, value) {
  const existing = target[name];
  if (!existing)
    return;
  if (existing === value) {
    delete target[name];
  } else if (Array.isArray(existing)) {
    const existingIndex = existing.indexOf(value);
    if (existingIndex != -1) {
      existing.splice(existingIndex, 1);
      if (existing.length == 1) {
        target[name] = existing[0];
      }
    }
  }
}

function addOrSet (target, name, value, force) {
  const existingValue = target[name];
  const sort = (a, b) => {
    const i1 =
      typeof a === 'number' ? a :
        typeof a === 'string' ? parseInt(a.substring(a.indexOf('№') + 1)) :
          null;
    const i2 =
      typeof b === 'number' ? b :
        typeof b === 'string' ? parseInt(b.substring(b.indexOf('№') + 1)) :
          null;
    if (i1 !== null && i2 !== null && i1 != i2) {
      return i1 < i2 ? -1 : i1 > i2 ? 1 : 0;
    } else {
      return (a < b ? -1 : a > b ? 1 : 0);
    }
  };
  if (existingValue === undefined || existingValue === null) {
    target[name] = value;
    return true;
  } else if (Array.isArray(existingValue)) {
    let found;
    if (typeof value === 'object') {
      found = indexOf(existingValue, value) !== -1;
    } else {
      found = existingValue.includes(value);
    }
    if (!found || force) {
      existingValue.push(value);
      target[name] = existingValue.sort(sort);
      return true;
    }
  } else if (!equals(existingValue, value) || force) {
    target[name] = [existingValue, value].sort(sort);
    return true;
  }
  return false;
}

function validateDataTables (tables, document, uik, electoralDistrictType, electoralDistrictId) {
  if (empty(tables)) {
    const container = XPath.select(
      'string(' +
      '//*[@id="report-body col"]' +
      '//div[' + hasClass.all(['row', 'tab-pane', 'active', 'show']) + ']' +
      ')',
      document
    );
    if (container) {
      const message = container.trim();
      if (message === 'Нет данных для построения отчета.') {
        console.log('UIK', uik.id, electoralDistrictType, electoralDistrictId, message);
        return false;
      }
      console.error('UIK:', uik.id, 'Message:', message);
      throw Error(message);
    }
    console.log('UIK:', uik.id, document.toString());
    throw Error('Required data table not found! UIK: ' + uik.id);
  }
  if (tables.length != 1) {
    console.log('UIK:', uik.id, tables);
    throw Error('More than one table found! UIK: ' + uik.id);
  }
  return true;
}

function parseDataTableRows (document, uik, electoralDistrictType, electoralDistrictId, protocol) {
  const tables = XPath.select(
    '//*[@id="report-body col"]' +
    '//div[' + hasClass.all(['row', 'tab-pane', 'active', 'show']) + ']' +
    '//*[local-name()="table" and @id="table-1"]',
    document
  );
  if (!validateDataTables(tables, document, uik, electoralDistrictType, electoralDistrictId)) {
    return null;
  }
  const tableRows =
    Object.values(
      Object.values(tables[0].childNodes)
        .filter((cell) => cell.nodeName == 'tbody')[0].childNodes
    )
      .filter((cell) => cell.nodeName == 'tr'
      );
  if (tableRows.length != 3) {
    console.error('UIK:', uik.id, 'rows count:', tableRows.length, tableRows, table.toString());
    throw Error('Invalid table, rows found: ' + tableRows.length + ', expected: 3. UIK: ' + uik.id);
  }

  const rows = [];
  tableRows.forEach((tableRow) => {
    const tableColumns = Object.values(tableRow.childNodes).filter((cell) => cell.nodeName == 'td');
    const columns = [];
    tableColumns.forEach((tableColumn) => {
      const column = tableColumn.textContent.trim();
      columns.push(column);
    });
    rows.push(columns);
  });

  if (rows[0].length != 1) {
    console.log(uik.id, toJson(rows[0]));
    throw Error('Encountered multi-column header when expected just one child. UIK: ' + uik.id);
  }

  if (rows[1].length != rows[2].length) {
    throw Error('Inconsistent key-value columns: ' + rows[1].length + ' vs ' + rows[2].length + '. UIK: ' + uik.id);
  }

  const map = {
    name: rows[0][0],
    values: {}
  };
  for (let index = 0; index < rows[1].length; index++) {
    const rowValue = rows[2][index];
    map.values[rows[1][index]] = rowValue ? (rowValue.includes('%') || rowValue.includes('.') ? parseFloat(rowValue.replace(/%$/gi, '')) : parseInt(rowValue)) : 0;
  }

  const externalMetadataMap = {
    'Число избирателей, включенных в список избирателей на основании поданных заявлений о включении в список избирателей по месту нахождения': {
      'в связи с подачей заявлений о включении в список избирателей по месту нахождения':
        ['voters', 'attached_count']
    },
    'Число избирателей, включенных в Реестр избирателей, подлежащих исключению из списка избирателей по месту жительства': {
      'в связи с подачей заявлений о включении в список избирателей по месту нахождения':
        ['voters', 'detached_count'],
      'в связи с подачей заявлений для участия в дистанционном электронном голосовании':
        ['voters', 'electronic_count']
    }
  };

  const metadata = {};

  Object.keys(map.values).forEach((valueKey) => {
    const outputKey = externalMetadataMap[map.name][valueKey];
    if (!outputKey)
      throw Error(map.name + ' -> ' + valueKey + ': ' + toJson(map));
    const value = map.values[valueKey];
    if (value != 0) {
      if (!metadata[outputKey[0]]) {
        metadata[outputKey[0]] = {};
      }
      if (metadata[outputKey[0]][outputKey[1]])
        throw Error(outputKey[0] + '.' + outputKey[1] + ': ' + toJson(protocol.metadata));
      metadata[outputKey[0]][outputKey[1]] = value;
    }
  });

  assignMetadata(protocol, metadata);

  return metadata;
}

function parseCyrillicDate (date) {
  // date = date; //.replace(/,/g, '').replace(/ {2,}/g, ' ').replace(/ /g, '.');
  [
    ['января', 1],
    ['февраля', 2],
    ['марта', 3],
    ['апреля', 4],
    ['мая', 5],
    ['июня', 6],
    ['июля', 7],
    ['августа', 8],
    ['сентября', 9],
    ['октября', 10],
    ['ноября', 11],
    ['декабря', 12]
  ].forEach((month) => {
    date = date.replace(new RegExp(month[0], 'i'), month[1].toString());
  });
  date = date.replace(/(?<=\d) (?=\d)/g, '.').replace(/,(?= )/g, '').replace(/(?<=^|\.| )0/g, '');
  date = date.split(' ');
  const time = date[1].split(':').map((item) => parseInt(item));
  date = date[0].split('.').map((item) => parseInt(item));
  return new Date(date[2], date[1] - 1, date[0], time[0], time[1]);
}

function mapElements (nodeList, mapper) {
  const array = [];
  for (let i = 0; i < nodeList.length; i++) {
    array.push(mapper(nodeList[i]));
  }
  return array;
}

function findFirstElement (node, filter, nested) {
  if (!node || !node.childNodes)
    return null;
  for (let i = 0; i < node.childNodes.length; i++) {
    const childNode = node.childNodes[i];
    if (filter(childNode)) {
      return childNode;
    }
    if (nested) {
      const foundElement = findFirstElement(childNode, filter, true);
      if (foundElement) {
        return foundElement;
      }
    }
  }
  return null;
}

function findChildElements (node, filter, nested) {
  if (!node || !node.childNodes)
    return null;
  const result = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const childNode = node.childNodes[i];
    if (filter(childNode)) {
      result.push(childNode);
    }
    if (nested) {
      const childElements = findChildElements(childNode, filter, true);
      if (childElements) {
        result.push(...childElements);
      }
    }
  }
  return result.length ? result : null;
}

function textContent (node, filter) {
  if (!filter)
    return node.textContent;
  const buf = [];
  node = node.firstChild;
  while(node){
    if(node.nodeType !== 7 && node.nodeType !== 8 && filter(node)) {
      buf.push(node.textContent);
    }
    node = node.nextSibling;
  }
  return buf.join('');
}

function toTikId (text) {
  const match = text.match(/(?<=№)\s*\d+/g)[0].trim();
  return parseInt(match);
}

function parseViolation (node) {
  node = node.getElementsByTagName('div')[0];
  const wrap = node
    .getElementsByTagName('div')[0];
  const header = wrap.getElementsByTagName('div')[0];
  const links = header.getElementsByTagName('a');
  const link = links[0];
  const spans = header.getElementsByTagName('span');
  const date = parseCyrillicDate(spans[0].textContent);
  const url = link.getAttribute('href');
  const id = parseInt(link.textContent.trim().match(/(?<=ID)\d+/g)[0]);

  const result = {
    id,
    url,
    date: date.getTime()
  };

  if (spans.length > 1 && spans[1].getAttribute('class') === 'kn__msg-related') {
    const relatedLink = spans[1].getElementsByTagName('a')[0];
    const relatedToId = parseInt(relatedLink.textContent.trim().match(/(?<=ID)\d+/g)[0]);
    result.original_report = {
      id: relatedToId,
      url: relatedLink.getAttribute('href')
    };
  }

  const regionElement = findFirstElement(node, (node) => node.nodeType === 1 && node.getAttribute('class') === 'kn__msg-region', true);
  if (regionElement) {
    let region = regionElement.textContent.trim();
    if (region) {
      region = region.split(',').map((item) => item.trim());
      const district = region.filter((item) => item.endsWith(' район') || item.endsWith(' р-н'))[0];
      if (district) {
        result.district = district.replace(/(?<= )р-н$/g, 'район');
      } else if (region.filter((item) => !(item === 'город Санкт-Петербург' || item === 'Sankt-Petersburg')).length) {
        throw Error(toJson(region));
      }
    }
  }

  let textElements = findChildElements(wrap, (node) => {
    return node.nodeType === 1 && node.getAttribute('class') === 'kn__msg-text kn__msg-text--collapsed';
  }, true);
  if (textElements && textElements.length > 1) {
    textElements = textElements.filter((element) => {
      return element.getAttribute('style') === 'display: none;';
    });
  }
  if (!textElements || textElements.length !== 1) {
    throw Error(result.url + ': ' + toJson(textElements));
  }
  result.text = textContent(textElements[0], (node) => !(node.nodeType === 1 && node.getAttribute('class') === 'condense_control condense_control_less')).trim();

  const tagsWrap = findFirstElement(node, (node) => {
    return node.nodeType === 1 && node.getAttribute('class') === 'kn__msg-tags';
  }, true);
  if (tagsWrap) {
    let tagName = null;
    for (let i = 0; i < tagsWrap.childNodes.length; i++) {
      const tagNode = tagsWrap.childNodes[i];
      if (tagNode.nodeType === 1 && tagNode.getAttribute('class') === 'kn__msg-tags--group') {
        tagName = tagNode.textContent;
        continue;
      }
      if (!tagName || tagNode.nodeType !== 1)
        continue;
      switch (tagName) {
        case 'УИК №': {
          const urlNode = tagNode.getElementsByTagName('a')[0];
          const uikId = parseInt(urlNode.textContent.trim());
          result.related_to_uik = uikId;
          break;
        }
        case 'ТИК': {
          const tikId = toTikId(tagNode.textContent);
          result.related_to_tik = tikId;
          break;
        }
        case 'Уровень выборов':
        case 'Жалобы':
        case 'Нарушения до дня голосования':
        case 'Нарушения в день голосования':
        case 'Нарушения при подсчете голосов':
        case 'Посягательства на личную безопасность': {
          const tags = findChildElements(tagNode, (node) => node.nodeType === 1 && node.getAttribute('class') === 'kn__msg-tags--name', true)
            .map((element) => {
              const link = element.getElementsByTagName('a');
              const result = {
                text: element.textContent
              };
              if (link) {
                result.url = link[0].getAttribute('href');
                const url = new URL('https://localhost' + result.url);
                const itr = url.searchParams.entries();
                let param;
                while ((param = itr.next()) && !param.done) {
                  const key = param.value[0];
                  const value = parseInt(param.value[1]) || param.value[1];
                  let subKey = key.match(/(?<=q\[)[^\]]+/gi);
                  subKey = subKey.length === 1 ? subKey[0] : null;
                  if (subKey) {
                    if (!result.q) {
                      result.q = {};
                    }
                    if (key.endsWith('[]')) {
                      if (!result.q)
                        result.q = {};
                      addOrSet(result.q, subKey, value);
                    } else {
                      result.q[subKey] = value;
                    }
                  } else {
                    if (key === 'text' || key === 'url')
                      throw Error(key);
                    result[key] = value;
                  }
                }
              }
              return result;
            });

          const tagNames = tags.map((tag) => {
            switch (tag.q.tags_id_in) {
              case 1: // Федеральные
                return 'federal';
              case 2: // Региональные
                return 'city';
              case 3: // Местные
                return 'municipality';

              case 4: // Подана жалоба
                return 'submitted';
              case 5: // Получена официальная реакция
                return 'received_official_response';
              case 83: // Особое мнение
                return 'special_opinion';

              // Нарушения до дня голосования
              case 32: // Злоупотребление административным ресурсом
                return 'administrative_resource_misuse'
              case 27: // Неправомерные отказы в регистрации и нарушение прав кандидата
                return 'wrongful_candidate_denials';
              case 35: // Нарушения правил агитации в СМИ
                return 'campaign_violation_mass_media';
              case 34: // Нарушение правил печатной и наружной агитации
                return 'campaign_violation_print';
              case 36: // Давление начальства, принуждение, подкуп избирателей
                return 'pressure_on_voters';
              case 37: // Нарушения порядка досрочного голосования
                return 'ahead_of_time';
              case 39: // Нарушение прав членов комиссии, наблюдателей, СМИ
                return 'observer_rights_failure';
              case 31: // Воздействие правоохранительных органов
                return 'corrupt_law_enforcement';
              case 40: // Иные нарушения до дня голосования
                return 'other';
              case 33: // Нарушения при сборе подписей
                return 'registration_violation';

              // Нарушения в день голосования
              case 42: // Нарушения перед началом голосования: проблемы с сейф-пакетами, несоблюдение процедур и т. п.
                return 'initial_setup_failure';
              case 41: // Нарушения в оборудовании участка
                return 'commission_equipment_failure';
              case 43: // Нарушения прав наблюдателей, членов комиссии, СМИ
                return 'observer_rights_failure';
              case 44: // Вбросы, «карусели» и т. п.
                return 'carousel_or_stuffing';
              case 45: // Нарушения при голосовании «на дому»
                return 'on_home';
              case 46: // Нарушение в ведении списка избирателей, отказ в голосовании
                return 'registered_voters';
              case 47: // Принуждение, подвоз избирателей, контроль голосования
                return 'pressure_on_voters';
              case 48: // Незаконная агитация, лотереи, подкуп
                return 'lottery';
              case 50: // Иные нарушения в день голосования
                return 'other';

              // Нарушения при подсчете голосов
              case 51: // Нарушения последовательности и процедуры подсчета
                return 'count_procedure_failure';
              case 52: // Искажение итогов голосования при подсчете
                return 'result_override';
              case 53: // Нарушения при составлении протокола, оформлении копии
                return 'result_protocol_failure';
              case 54: // Нарушения в вышестоящих комиссиях
                return 'parent_commission';
              case 55: // Иные нарушения при подсчете и установлении итогов
                return 'other';

              // Посягательства на личную безопасность
              case 56: // Посягательство на жизнь, здоровье, имущество
                return 'death';
            }
            throw Error(toJson(tag));
          });

          switch (tagName) {
            case 'Уровень выборов': {
              result.electoral_district_types = tagNames;
              break;
            }
            case 'Жалобы':
            case 'Посягательства на личную безопасность': {
              const map = {
                'Жалобы': 'complaints',
                'Посягательства на личную безопасность': 'threats'
              };
              const obj = {};
              tagNames.forEach((tagName) => {
                obj[tagName] = true;
              });
              result[map[tagName]] = obj;
              break;
            }
            case 'Нарушения до дня голосования':
            case 'Нарушения в день голосования':
            case 'Нарушения при подсчете голосов': {
              const map = {
                'Нарушения до дня голосования': 'before',
                'Нарушения в день голосования': 'during',
                'Нарушения при подсчете голосов': 'finale'
              };
              if (!result.violations) {
                result.violations = {};
              }
              result.violations[map[tagName]] = tagNames;
              break;
            }
          }

          break;
        }
        case 'Заявитель': {
          const map = {
            'Член избирательной комиссии': 'member',
            'Избиратель': 'voter',
            'Представитель СМИ': 'mass_media',
            'Наблюдатель': 'observer',
            'Кандидат': 'candidate'
          };
          const name = tagNode.textContent.trim();
          result.reported_by = map[name];
          if (!result.reported_by)
            throw Error(toJson(name));
          break;
        }
        default:
          throw Error(toJson(tagName));
      }
    }
  }

  let sourceWrap = findFirstElement(node, (node) => {
    return node.nodeType === 1 && node.getAttribute('class') === 'row kn__msg-source';
  }, true);
  if (sourceWrap) {
    sourceWrap = findFirstElement(sourceWrap, (node) => {
      return node.nodeType === 1 && node.getAttribute('class') === 'kn__msg-source--link';
    }, true).getElementsByTagName('a')[0];
    result.source_url = sourceWrap.getAttribute('href');
  }

  let filesWrap = findFirstElement(node, (node) => {
    return node.nodeType === 1 && node.getAttribute('class') === 'row kn__msg-files';
  }, true);
  filesWrap = findFirstElement(filesWrap, (node) => {
    return node.nodeType === 1 && node.getAttribute('class') === 'col-lg-9';
  });

  if (filesWrap) {
    const attachments = [];
    for (let i = 0; i < filesWrap.childNodes.length; i++) {
      const fileNode = filesWrap.childNodes[i];
      if (fileNode.nodeType !== 1)
        continue;
      const className = fileNode.getAttribute('class').split(' ')[0];
      const supportedHosts = [
        'youtu.be', 'youtube.com',
        'drive.google.com', 'photos.app.goo.gl',
        'instagram.com',
        'vm.tiktok.com',
        't.me',
        'disk.yandex.ru', 'disk.yandex.com',
        'cloud.mail.ru',
        'vk.com'
      ];
      const supportedRawHosts = [
        'files.kartanarusheniy.org'
      ];
      switch (className) {
        case 'document': {
          const links = mapElements(fileNode.getElementsByTagName('a'), (link) => {
            return link.getAttribute('href').replace(/(?<=\/)large(?=\/)/g, 'original').replace(/^(?=\/\/)/g, 'https:');
          });
          links.forEach((url) => {
            const host = new URL(url).host.replace(/^www\./, '');
            if (!supportedRawHosts.includes(host)) {
              throw Error('Unsupported raw host: ' + host);
            }
            attachments.push({
              type: 'photo',
              source_url: url
            })
          });
          break;
        }
        case 'image': {
          let gallery = findFirstElement(fileNode, (node) => node.nodeType === 1 && node.getAttribute('class') === 'highslide-gallery', true);
          if (!gallery) {
            throw Error();
          }
          gallery = findChildElements(fileNode, (node) => node.nodeType === 1 && (node.getAttribute('class') || '').match(/^highslide\s*$/), true);
          if (!gallery) {
            throw Error();
          }
          gallery = gallery.map((link) => {
            return link.getAttribute('href').replace(/(?<=\/)large(?=\/)/g, 'original').replace(/^(?=\/\/)/g, 'https:');
          });
          gallery.forEach((url) => {
            const host = new URL(url).host.replace(/^www\./, '');
            if (!supportedRawHosts.includes(host)) {
              throw Error('Unsupported raw host: ' + host);
            }
            attachments.push({
              type: 'photo',
              source: url
            });
          });
          break;
        }
        case 'video': {
          const videoNodes = findChildElements(fileNode, (node) => node.nodeType === 1 && node.getAttribute('class') === 'it');
          if (videoNodes) {
            videoNodes.forEach((videoNode) => {
              const videoSourceElement = findFirstElement(videoNode, (node) => node.nodeType === 1 && node.getAttribute('class') === 'date');
              const videoUrl = videoSourceElement.textContent.trim();
              if (videoUrl) {
                const url = new URL(videoUrl);
                if (!supportedHosts.includes(url.host.replace(/^www\./g, ''))) {
                  throw Error('Unsupported video host: ' + url.host);
                }
                attachments.push({
                  type: 'video',
                  source_url: videoUrl
                });
              }
            });
          }
          break;
        }
        default:
          throw Error(className);
      }
    }
    if (attachments.length) {
      result.attachments = attachments;
    }
  }

  return result;
}

function parseViolations (document) {
  const messagesRaw = XPath.select(
    '//div[' + hasClass.one('kn__msgs') + ']' +
    '//div[' + hasClass.one('kn__b--msg') + ']',
    document
  );
  const messages = [];
  for (let i = 0; i < messagesRaw.length; i++) {
    const messageRaw = messagesRaw[i];
    messages.push(parseViolation(messageRaw));
  }
  return messages;
}

async function fetchViolationsMap (firstPageUrl) {
  const firstPageRaw = (await getHtmlFile(
    path.join('data-raw', REGION_NAME, 'violations-map', 'page-1.json'),
    firstPageUrl,
    true
  )).document;

  const pages = [
    parseViolations(firstPageRaw)
  ];

  const lastPageNum = parseInt(XPath.select('string(' +
    '//ul[@class="pagination"]' +
    '//li[' + hasClass.all(['last', 'next']) + ']' +
    '//a/@href' +
    ')', firstPageRaw
  ).trim().match(/(?<=page=)\d+/g)[0]);

  for (let pageNum = 2; pageNum <= lastPageNum; pageNum++) {
    const nextPageRaw = (await getHtmlFile(
      path.join('data-raw', REGION_NAME, 'violations-map', 'page-' + pageNum + '.json'),
      firstPageUrl + '?page=' + pageNum,
      true
    )).document;
    pages.push(parseViolations(nextPageRaw));
  }

  const result = {};
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    pages[pageIndex].forEach((violation) => {
      if (result[violation.id])
        throw Error(violation.url + ' vs ' + result[violation.id].url);
      result[violation.id] = violation;
    });
  }
  return result;
}

function assignMetadata (protocol, metadata) {
  if (empty(metadata) || !protocol) {
    return;
  }
  const targetMetadata = protocol.metadata || (protocol.metadata = {});
  for (const metadataGroupKey in metadata) {
    const targetMetadataGroup = targetMetadata[metadataGroupKey] || (targetMetadata[metadataGroupKey] = {});
    for (const metadataKey in metadata[metadataGroupKey]) {
      if (targetMetadataGroup[metadataKey])
        throw Error(metadataGroupKey + '.' + metadataKey + ': ' + targetMetadataGroup[metadataKey]);
      const value = metadata[metadataGroupKey][metadataKey];
      targetMetadataGroup[metadataKey] = value;
      if (!protocol.empty && metadataGroupKey === 'voters' && metadataKey.endsWith('_count') && metadataKey !== 'detached_count') {
        const key = metadataKey.replace(/(?<=_)count$/, 'percentage');
        targetMetadataGroup[key] = value / protocol.metadata.voters.registered_count * 100;
      }
    }
  }
}

function parseDataTableRows2 (document, uik, electoralDistrictType, electoralDistrictId) {
  const tables = XPath.select(
    '//*[@id="report-body col"]' +
    '//div[' + hasClass.all(['row', 'tab-pane', 'active', 'show']) + ']' +
    '//*[local-name()="table" and not(self::table)]',
    document
  );
  if (!validateDataTables(tables, document, uik, electoralDistrictType, electoralDistrictId)) {
    return null;
  }

  const theadRows =
    Object.values(
      Object.values(tables[0].childNodes)
        .filter((cell) => cell.nodeName == 'thead')[0].childNodes
    )
      .filter((cell) => cell.nodeName == 'tr'
      );

  if (theadRows.length < 2) {
    console.log(uik.id, tables[0].toString());
    throw Error(theadRows.length);
  }

  const timeColumns = Object.values(theadRows[1].childNodes).filter((cell) => cell.nodeName == 'th');

  if (timeColumns.length === 0) {
    console.log(uik.id, tables[0].toString());
    throw Error(timeColumns.length);
  }

  if (timeColumns[0].textContent.trim().toLowerCase() != 'Отчетное время'.toLowerCase()) {
    console.log(uik.id, tables[0].toString());
    throw Error(timeColumns[0].textContent.trim());
  }

  if (timeColumns.length <= 1) {
    // console.log(uik.id, tables[0].toString());
    return null;
  }

  const timeValues = timeColumns.map((cell) => cell.textContent.trim()).slice(1);
  if (timeValues.filter((content) => !content.match(/^\d+\.\d+$/gi)).length) {
    console.log(timeValues);
    throw Error();
  }

  const tbodyRows =
    Object.values(
      Object.values(tables[0].childNodes)
        .filter((cell) => cell.nodeName == 'tbody')[0].childNodes
    )
      .filter((cell) => cell.nodeName == 'tr'
      );

  if (!tbodyRows.length) {
    return null;
  }

  if (tbodyRows.length != 1) {
    console.log(uik.id, tables[0].toString());
    throw Error(tbodyRows.length);
  }

  const tableColumns = Object.values(tbodyRows[0].childNodes).filter((cell) => cell.nodeName == 'td');

  const onlyPercentage = tableColumns.length == 2 + timeValues.length;

  if (tableColumns.length != 2 + timeValues.length * (onlyPercentage ? 1 : 2)) {
    console.log(uik.id, tables[0].toString());
    throw Error(tableColumns.length);
  }

  const columnValues = tableColumns.map((cell, index) => {
    const value = cell.textContent.trim();
    if (index > 1) {
      if (value.length == 0)
        return null;
      if (!onlyPercentage && index % 2 == 0) {
        const intValue = parseInt(value);
        if (isNaN(intValue)) {
          console.log(uik.id, tables[0].toString());
          throw Error(value);
        }
        return intValue;
      } else {
        if (!value.endsWith('%')) {
          console.log(uik.id, tables[0].toString());
          throw Error(value);
        }
        const floatValue = parseFloat(value.substring(0, value.length - 1));
        if (isNaN(floatValue)) {
          console.log(uik.id, tables[0].toString());
          throw Error(value);
        }
        return floatValue;
      }
    }
    return value;
  });

  if (parseInt(columnValues[0]) != uik.id || columnValues[1] != 'УИК №' + uik.id) {
    console.log(columnValues);
    throw Error(columnValues[1]);
  }

  columnValues.splice(0, 2);

  const dateColumn = XPath.select(
    '//*[@id="report-body col"]' +
    '//div[' + hasClass.all(['row', 'tab-pane', 'active', 'show']) + ']' +
    '//table[' + hasClass.one('table-borderless') + ']' +
    '//td[contains(text(), "Дата голосования")]',
    document
  );
  const date = dateColumn[0].textContent.trim().match(/\d+\.\d+\.\d+/gi)[0];

  const result = { };

  timeValues.forEach((time) => {
    const value = columnValues.splice(0, onlyPercentage ? 1 : 2);
    if (value[0] == null && (onlyPercentage || value[1] == null)) {
      result[date] = null;
      return;
    }
    if (!result[date]) {
      result[date] = {};
    }
    if (onlyPercentage) {
      result[date][time] = {
        percentage: value[0]
      };
    } else {
      result[date][time] = {
        percentage: value[1],
        count: value[0],
        registered_count: Math.round(value[0] / (value[1] / 100.0))
      };
    }
  });

  return result;
}

function parseDataTableRows3 (document, uik, electoralDistrictType, electoralDistrictId) {
  const tables = XPath.select(
    '//*[@id="report-body col"]' +
    '//div[' + hasClass.all(['row', 'tab-pane', 'active', 'show']) + ']' +
    '//*[local-name()="table" and not(self::table)]',
    document
  );
  if (!validateDataTables(tables, document, uik, electoralDistrictType, electoralDistrictId)) {
    return null;
  }
  const tableRows =
    Object.values(
      Object.values(tables[0].childNodes)
        .filter((cell) => cell.nodeName == 'tbody')[0].childNodes
    )
      .filter((cell) => cell.nodeName == 'tr');
  const items = [];
  let summary = {};
  tableRows.forEach((tableRow) => {
    const tableColumns = Object.values(tableRow.childNodes).filter((cell) => cell.nodeName == 'td');
    const columns = [];
    tableColumns.forEach((tableColumn) => {
      const column = {text: tableColumn.textContent.trim()};
      if (column.text.match(/^[0-9]+$/)) {
        column.number = parseInt(column.text);
      } else if (column.text.match(/^[0-9]+\.[0-9]+$/)) {
        column.number = parseFloat(column.text);
      }
      let commissionMatch = column.text.match(/^(УИК|Участковая|Территориальная)(?: избирательная комиссия)? *№(\d+)$/i); // TODO tik
      if (commissionMatch) {
        column.commission_type = commissionMatch[1].match(/^Участковая|УИК$/i) ? 'uik' : 'tik';
        column.commission_id = parseInt(commissionMatch[2]);
      }
      if (tableColumn.childNodes.length === 1 && tableColumn.childNodes[0].nodeName === 'a') {
        column.url = new URL(tableColumn.childNodes[0].getAttribute('href'));
        const vibid = parseInt(column.url.searchParams.get('vibid'))
        const tvd = parseInt(column.url.searchParams.get('tvd'));
        if (vibid) {
          column.vibid = vibid;
        }
        if (tvd) {
          column.tvd = tvd;
        }
      }
      columns.push(column);
    });
    if (columns.length !== (electoralDistrictType === 'municipality' ? 5 : 6))
      throw Error(columns.length + ', expected 6');
    if (columns[0].number) {
      if (columns[0].number !== columns[1].commission_id)
        throw Error();
      const info = {
        commission_type: columns[1].commission_type,
        commission_id: columns[1].commission_id,
        registered_voters_count: columns[2].number
      };
      if (columns[3].number) {
        info.children_commission_count = columns[3].number;
      }
      if (columns[1].vibid) {
        info.vibid = columns[1].vibid;
      }
      if (columns[1].tvd) {
        info.tvd = columns[1].tvd;
      }
      summary.actual_registered_voters_count = (summary.actual_registered_voters_count || 0) + info.registered_voters_count;
      items.push(info);
    } else {
      summary.registered_voters_count = columns[2].number;
    }
  });
  if (summary.registered_voters_count && summary.actual_registered_voters_count && summary.registered_voters_count !== summary.actual_registered_voters_count) {
    const diff = (summary.registered_voters_count - summary.actual_registered_voters_count);
    if (diff > 0) {
      summary.exceeding_registered_voters_count = diff;
    } else {
      summary.missing_registered_voters_count = -diff;
      throw Error('Mismatch: ' + diff);
    }
  }
  return {summary, items};
}

function parseDataTableRows4 (document, reportId) {
  const reportName = XPath.select('string(' +
    '//*[@id="report-body col"]' +
    '//div[' + hasClass.all(['row', 'tab-pane', 'active', 'show']) + ']' +
    '//*[@id="rep-name"]' +
    ')', document
  ).trim();
  const electionName = XPath.select('string(' +
    '//*[@id="report-body col"]' +
    '//div[' + hasClass.all(['row', 'tab-pane', 'active', 'show']) + ']' +
    '//*[@id="vib-name"]' +
    ')', document
  ).trim();
  const metadataTables = XPath.select(
    '//*[@id="report-body col"]' +
    '//div[' + hasClass.all(['row', 'tab-pane', 'active', 'show']) + ']' +
    '//table[' + hasClass.one('table-borderless') + ']',
    document
  );
  const protocolTable = XPath.select(
    '//*[@id="report-body col"]' +
    '//div[' + hasClass.all(['row', 'tab-pane', 'active', 'show']) + ']' +
    '//*[local-name()="table"][' + hasClass.all(['table-bordered', 'table-striped', 'table-sm']) + ']',
    document
  );

  if (protocolTable.length === 0) {
    return null;
  }

  const lines = [];
  const protocolRows = protocolTable[0].getElementsByTagName('tr');

  let delimiterCount = 0;

  let sectionedRowIndex = 0;
  for (let rowIndex = 0; rowIndex < protocolRows.length; rowIndex++) {
    const row = protocolRows[rowIndex];
    const tds = row.getElementsByTagName('td');
    const columns = [];
    for (let j = 0; j < tds.length; j++) {
      const column = htmldecode(tds[j].textContent).trim();
      if (column.match(/^\d+$/)) {
        columns.push(parseInt(column));
      } else {
        columns.push(column);
      }
    }
    if (!columns.join('').trim()) {
      lines.push({
        delimetr: '1'
      });
      sectionedRowIndex = 0;
      delimiterCount++;
    } else {
      if (lines.length > 0 && !lines[lines.length - 1].delimetr && lines[lines.length - 1].txt.startsWith('Число') && !columns[1].startsWith('Число')) {
        lines.push({
          delimetr: '1'
        });
        sectionedRowIndex = 0;
        delimiterCount++;
      }
      const line = {
        txt: columns[1],
        numsved: (sectionedRowIndex + 1).toString(),
        index: (columns[0]).toString()
      };
      if (typeof columns[2] === 'number') {
        line.kolza = columns[2].toString();
      } else {
        const nums = columns[2].split('\n').map((item) => {
          let val = item.trim();
          const floating = val.match(/^\d+\.\d+%?$/gi);
          if (floating) {
            return parseFloat(floating[0].endsWith('%') ? floating[0].substring(0, floating[0].length - 1) : floating[0]);
          } else if (val.match(/^\d+$/)) {
            return parseInt(val);
          } else {
            throw Error(toJson(val));
          }
        });
        line.kolza = nums[0].toString();
        line.perza = nums[1].toString();
      }
      lines.push(line);
      sectionedRowIndex++;
    }
  }

  if (delimiterCount !== 1 && lines.length > 0) {
    throw Error('delimiterCount !== 1');
  }

  let electionDate = null;
  let uikId = null;

  metadataTables.forEach((metadataTable) => {
    const rows = metadataTable.getElementsByTagName('tr');
    if (rows) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const tds = row.getElementsByTagName('td');
        for (let j = 0; j < tds.length; j++) {
          const column = tds[j].textContent.trim();
          if (column.match(/^Дата голосования/i)) {
            electionDate = column.match(/\d+\.\d+\.\d+$/)[0];
          } else if (column.match(/^УИК №/i)) {
            uikId = parseInt(column.match(/(?<=УИК №)\d+/)[0]);
          }
        }
      }
    }
  });

  if (!lines.length || !reportName || !electionName) {
    console.log(uikId, 'report', reportId, 'is empty');
  }

  return {
    report: {
      tvd: 'УИК №' + uikId,
      date_sign: 'none',
      vrnvibref: 0,
      line: lines,
      data_gol: electionDate,
      is_uik: '1',
      type: reportId.toString(),
      version: '0',
      sgo_version: '5.6.0',
      isplann: '0',
      podpisano: '-1',
      versions: {
        ver: {
          current: true,
          content: 0
        }
      },
      vibory: electionName,
      repforms: 1,
      generation_time: '20.09.2021 12:14:04',
      nazv: reportName,
      datepodp: ''
    }
  };
}

function distanceTo (fromLocation, toLocation) {
  if (!fromLocation || !toLocation) return NaN;
  return geolib.getPreciseDistance(fromLocation, toLocation, 1);
}

function sameBuilding (a, b) {
  const aComponents = Object.keys(a.address).filter((key) => key !== 'city' && key !== 'country' && key !== 'apartment' && key !== 'district').sort();
  const bComponents = Object.keys(b.address).filter((key) => key !== 'city' && key !== 'country' && key !== 'apartment' && key !== 'district').sort();
  if (aComponents.length !== bComponents.length) {
    return false;
  }
  if (!aComponents.length) {
    return false;
  }
  for (let i = 0; i < aComponents.length; i++) {
    const aComponent = aComponents[i];
    const bComponent = bComponents[i];
    if (aComponent !== bComponent) {
      return false;
    }
    const aValue = a.address[aComponent];
    const bValue = b.address[bComponent];
    if (aValue !== bValue) {
      if (Array.isArray(aValue) && Array.isArray(bValue) && arrayEquals(aValue, bValue))
        continue;
      return false;
    }
  }
  return true;
}

function allProtocolsOf (data, commission) {
  const findProtocols = (electoralDistrictType, id) => {
    if (Array.isArray(id)) {
      const result = [];
      id.forEach((localId) => {
        result.push(... findProtocols(electoralDistrictType, localId));
      });
      return result;
    }
    let protocol;
    if (commission.type === 'uik') {
      let allProtocols = data.results_by_uik[commission.id];
      const protocols = allProtocols ? allProtocols[electoralDistrictType] : null;
      protocol = protocols ? (!id ? protocols.parties : protocols[id] || protocols['person_' + id]) : null;
    } else {
      const protocols = data['results_by_' + commission.type][electoralDistrictType];
      protocol = !id ? (protocols.parties ? protocols.parties[commission.id] : null) : (protocols[id] || protocols['person_' + id])[commission.id];
    }
    const result = [];
    if (protocol) {
      result.push(protocol);
    }
    return result;
  };
  const allProtocols = [];
  for (const electoralDistrictType in commission.electoral_districts) {
    if (!commission.electoral_districts.hasOwnProperty(electoralDistrictType)) {
      continue;
    }
    const ids = commission.electoral_districts[electoralDistrictType];
    if (electoralDistrictType === 'municipality') {
      for (const municipality in ids) {
        if (ids.hasOwnProperty(municipality)) {
          const id = ids[municipality];
          if (Array.isArray(id)) {
            allProtocols.push(... findProtocols(electoralDistrictType, id.map((key) => municipality + '_' + key)));
          } else {
            allProtocols.push(... findProtocols(electoralDistrictType, municipality + '_' + id));
          }
        }
      }
    } else {
      allProtocols.push(... findProtocols(electoralDistrictType, 0));
      if (ids) {
        allProtocols.push(...findProtocols(electoralDistrictType, ids));
      }
    }
  }
  return allProtocols;
}

function allCommissionsOf (data, target) {
  if (Array.isArray(target.related_to.venue)) {
    let venueCount = target.related_to.venue.length;
    let uik = target.related_to.uik !== undefined ? (Array.isArray(target.related_to.uik) ? cloneArray(target.related_to.uik) : [target.related_to.uik]) : null;
    let tik = target.related_to.tik !== undefined ? (Array.isArray(target.related_to.tik) ? cloneArray(target.related_to.tik) : [target.related_to.tik]) : null;
    let gik = target.related_to.gik !== undefined ? (Array.isArray(target.related_to.gik) ? cloneArray(target.related_to.gik) : [target.related_to.gik]) : null;
    const result = [];
    while (venueCount > 0) {
      if (uik && uik.length) {
        const uikId = uik.splice(0, 1)[0];
        result.push(data.uiks[uikId]);
      } else if (tik && tik.length) {
        const tikId = tik.splice(0, 1)[0];
        result.push(data.gik.tiks[tikId]);
      } else if (gik && gik.length) {
        const gikId = tik.splice(0, 1)[0];
        result.push(data.gik);
      } else {
        throw Error();
      }
      venueCount--;
    }
    return result;
  }
  const commission = target.related_to.uik ? data.uiks[target.related_to.uik] :
    target.related_to.tik ? data.gik.tiks[target.related_to.tik] :
      target.related_to.gik ? data.gik : 0;
  return [commission];
}

// PARSERS

function fullName (name) {
  let fullName = '';
  ['last', 'first', 'middle'].forEach(key => {
    if (name[key]) {
      if (fullName)
        fullName += ' ';
      fullName += name[key];
    }
  });
  return fullName;
}

function processEntry (map, entry, keys, duplicateCallback, venue, needParentVenue) {
  if (map.totalCount === undefined) map.totalCount = 0;
  if (map.keyToId === undefined) map.keyToId = {};
  if (map.entries === undefined) map.entries = {};

  let existingId = null;
  if (typeof keys === 'string') {
    existingId = map.keyToId[keys];
  } else if (keys && keys.length) {
    for (let i = 0; i < keys.length; i++) {
      existingId = map.keyToId[keys[i]];
      if (existingId)
        break;
    }
  }
  if (existingId) {
    const existingEntry = map.entries[existingId];
    if (venue) {
      addVenue(existingEntry, venue);
    }
    if (duplicateCallback) {
      duplicateCallback(existingEntry, entry);
    }
    return existingId;
  }

  const id = ++map.totalCount;
  if (typeof keys === 'string') {
    map.keyToId[keys] = id;
  } else if (keys && keys.length) {
    for (let i = 0; i < keys.length; i++) {
      map.keyToId[keys[i]] = id;
    }
  }

  if (venue) {
    addVenue(entry, venue);
  }
  map.entries[id] = entry;
  return id;
}

const knownLocationsMap = {};

function parseAddress (rawAddress, venue, optional) {
  if (!rawAddress.address)
    throw Error('Address is missing in ' + JSON.stringify(venue) + ': ' + JSON.stringify(rawAddress));
  const address = {
    type: null,
    name: null,
    address: null
  };
  let rawAddressStr = rawAddress.address
    .replace(/ +/gi, ' ')
    .replace(/(?<=№)\s*/gi, '')
    .replace(/(?<=, кабинет )(\d+),\s*(\d+)/gi, '$1 и $2');
  if (rawAddress.descr) {
    address.name = ucfirst(rawAddress.descr.trim());
  }
  const name = rawAddressStr.match(/(?<=\()[^)]+(?=\)$)/gi);
  if (name) {
    if (!address.name) {
      address.name = name[0];
    } else if (address.name != name[0]) {
      address.alternate_name = name[0];
    }
    rawAddressStr = rawAddressStr.replace(/\s*\([^)]+\)$/gi, '');
  }
  if (rawAddress.phone) {
    const phoneNumbers = rawAddress.phone.split(', ');
    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i]
        .replace(/(?=\()/gi, ' ')
        .replace(/(?<=\))/gi, ' ')
        .replace(/^8/gi, '+7')
        .replace(/(\d\d\d)(\d\d)(\d\d)$/gi, '$1-$2-$3');
      addOrSet(address, 'phone_number', phoneNumber);
    }
  }
  if (rawAddress.lat && rawAddress.lon) {
    address.location = {
      latitude: parseFloat(rawAddress.lat),
      longitude: parseFloat(rawAddress.lon)
    };
  }
  const addressParts = rawAddressStr.split(', ');
  address.address = { };
  const header = addressParts.splice(0, 1)[0];
  const postalIndex = parseInt(header);
  if (postalIndex) {
    address.address.postal_index = postalIndex;
  } else {
    address.address.country = header;
    if (!header.match(/^(Российская Федерация|РФ|Россия)$/g)) {
      address.abroad = true;
    }
  }
  if (addressParts.length > 0) {
    let subheader = addressParts.splice(0, 1)[0];
    if (subheader.match(/^(Российская Федерация|РФ|Россия|Германия|Болгария)$/gi)) {
      address.address.country = subheader;
      if (!address.address.country.match(/^(Российская Федерация|РФ|Россия)$/g)) {
        address.abroad = true;
      }
      subheader = addressParts.length > 0 ? addressParts.splice(0, 1)[0] : undefined;
    }
    address.address.city = subheader;
  } else if (optional) {
    return null;
  } else {
    throw Error('Weird address in ' + JSON.stringify(venue) + ': ' + JSON.stringify(rawAddress));
  }
  while (addressParts.length > 0) {
    const part = addressParts[0].toLowerCase();
    if (part.includes('муниципальное образование')) {
      address.address.municipality = addressParts.splice(0, 1)[0];
    } else if (part.endsWith('район')) {
      address.address.district = addressParts.splice(0, 1)[0];
    } else {
      break;
    }
  }
  const apartment = [], building = [], country = [], city = [];
  while (addressParts.length > 0) {
    const part = addressParts[addressParts.length - 1].toLowerCase();
    if (part.match(/^(Российская Федерация|РФ|Россия|Германия|Болгария)$/gi)) {
      country.unshift(addressParts.pop());
    } else if (part.match(/^(город |г\.|гор\.).+$/gi)) {
      city.unshift(addressParts.pop());
    } else if (part.match(/^(квартира|кабинет|каб\.)\s.+/gi)) {
      apartment.unshift(addressParts.pop());
    } else if (part.match(/^(корпус|литер|дом|литера)\s.+/gi) ||
      part.match(/.+\s(корпус|литер|литера|дом)$/gi)) {
      building.unshift(addressParts.pop());
    } else {
      break;
    }
  }
  if (country.length > 0) {
    address.address.country = country.join(', ');
    if (!address.address.country.match(/^(Российская Федерация|РФ|Россия)$/gi)) {
      address.abroad = true;
    }
  }
  if (city.length > 0) {
    address.address.city = city.join(', ');
  }
  if (addressParts.length > 0) {
    const street = addressParts.join(', ').trim();
    if (street) {
      address.address.street = street;
    }
  } else if (optional) {
    return null;
  } else {
    throw Error('Weird address in ' + JSON.stringify(venue) + ': ' + JSON.stringify(rawAddress));
  }
  if (building.length) {
    address.address.building = building.join(', ');
  }
  if (apartment.length) {
    address.address.apartment = apartment.join(', ');
  }
  if (!address.name) {
    const knownName = knownLocationsMap[addressToString(address.address, true)];
    if (knownName) {
      address.name = knownName;
    }
  }
  if (address.name) {
    parseAddressType(address);
  }

  const restoredAddress = addressToString(address.address);
  if (rawAddressStr.trim().replace(/\s*,$/gi, '') != restoredAddress) {
    throw Error('Could not parse: ' + toJson(rawAddress.address));
  }

  return address;
}

function parseAddressType (address) {
  const name = address.name.toLowerCase();
  const schoolId = parseInt(name.replace(/^.*(?:ГБОУ СОШ|ГОУ СОШ|ГБОУ НОШ|ГОУ НОШ|Лицей|Гимназия|Школа|здание школы|здание гимназии|здание лицея)\s*№\s*(\d+).*$/gi, '$1'));
  if (schoolId) {
    address.type = 'school';
    address.school_id = schoolId;
    return;
  }
  const preSchoolId = parseInt(name.replace(/^.*(?:ГБДОУ|детский сад)\s*№\s*(\d+).*$/gi, '$1'));
  if (preSchoolId) {
    address.type = 'preschool';
    address.preschool_id = preSchoolId;
    return;
  }
  const neuropsychiatryId = parseInt(name.replace(/^.*(?:Психоневрологический интернат|Психо-неврологический интернат|ПНИ)\s*№\s*(\d+).*$/gi, '$1'));
  if (neuropsychiatryId) {
    address.type = 'neuropsychiatry';
    address.neuropsychiatry_id = neuropsychiatryId;
    return;
  }
  const hospitalId = parseInt(name.replace(/^.*(?:поликлиника|больница)\s*№\s*(\d+).*$/gi, '$1'));
  if (hospitalId) {
    address.type = 'hospital';
    address.preschool_id = hospitalId;
    return;
  }

  if (name.match(/^Администрация\s+\S+\s+района/gi)) {
    address.type = 'district_administration';
  } else if (name.includes('генконсульство')) {
    address.type = 'consulate';
  } else if (name.includes('посольство')) {
    address.type = 'embassy';
  } else if (name.includes('администрация')) {
    address.type = 'administration';
  } else if (name.match(/^Законодательное собрание/gi)) {
    address.type = 'assembly';
  } else if (name.includes('общежитие')) {
    address.type = 'dormitory';
  } else if (name.includes('университет')) {
    address.type = 'university';
  } else if (name.includes('колледж')) {
    address.type = 'college';
  } else if (name.includes('институт')) {
    address.type = 'institute';
  } else if (name.match(/^.*(школа|гимназия|лицей).*$/g)) {
    address.type = 'school';
  } else if (name.match(/^.+(библиотека).*$/g)) {
    address.type = 'library';
  } else {
    address.type = 'unknown';
  }
}

function addressToString (address, forKey) {
  let restoredAddress = '';
  for (const key in address) {
    if (forKey && key === 'apartment')
      continue;
    if (restoredAddress.length) restoredAddress += ', ';
    let value = address[key];
    if (forKey) {
      switch (key) {
        case 'street': {
          value = value.replace(/([^,]+)\s+(улица|проспект|шоссе|площадь|бульвар|набережная|переулок),?$/gi, '$2 $1');
          if (address.country === 'Германия') {
            value = value.replace(/штрассе(?=($|\s|,))/gi, 'штрасе');
          }
          break;
        }
        case 'city': {
          value = value.replace(/^(гор\.|г\.|город )\s*/gi, '');
          break;
        }
      }
    }
    restoredAddress += value;
  }
  restoredAddress = restoredAddress.trim().replace(/\s*,$/gi, '');
  if (forKey) {
    restoredAddress = restoredAddress.replace(/\s*\([^)]+\)$/gi, '').toLowerCase();
  }
  return restoredAddress;
}

const firstNameWhiteList = [
  // {"name":"УИК №9","data_id":4784001269022}, {"vrn":"4784001392928","fio":"Катависто Катрин Мария Анастасия ","birthdate":"1992-08-23","position":"Член комиссии","vydv":"собрание избирателей по месту работы"}
  'Катрин Мария Анастасия',
  // {"name":"УИК №1582","data_id":4784022249833}, {"vrn":"4784022248185","fio":"Ляхович Анна Виктория Дмитриевна",       "birthdate":"1999-02-25","position":"Член комиссии","vydv":"Невское местное (районное) отделение Всероссийской политической партии \"ЕДИНАЯ РОССИЯ\""}
  'Анна Виктория',
  // {"name":"УИК №430","data_id":4784004300921}, {"vrn":"478403884887","fio":"Флерова Анна София Германиковна","birthdate":"1994-03-26","position":"Член комиссии","vydv":"Санкт-Петербургское региональное отделение Политической партии ЛДПР - Либерально-демократической партии России"}
  'Анна София',
  // {"name":"УИК №577","data_id":9789005302018}, {"vrn":"9789005300654","fio":"Бенавидес Мартинес Мария Наркиссовна","birthdate":"1971-12-11","position":"Член комиссии","vydv":"Политическая партия \"Российская объединенная демократическая партия \"ЯБЛОКО\""}
  'Мартинес Мария',
  // {"name":"УИК №1033","data_id":4784025268983}, {"vrn":"478404584093","fio":"Либерман Николь Изабель ","birthdate":"2000-08-08","position":"Член комиссии","vydv":"собрание избирателей по месту жительства"}
  'Николь Изабель', // Харланова

  // {"name":"УИК №1737","data_id":4784014283607}, {"vrn":"4784014366413","fio":"Рахман Хашими Саббир Мизанурович",       "birthdate":"2001-12-27","position":"Член комиссии","vydv":"Приморское местное (районное) отделение Санкт-Петербургского городского отделения политической партии «Коммунистическая партия Российской Федерации»"}
  'Хашими Саббир',
  // {"name":"УИК №1782","data_id":4784014283689}, {"vrn":"4784014366914","fio":"Рахман Хашими Матиар Мизанурович",       "birthdate":"1999-07-29","position":"Член комиссии"}
  'Хашими Матиар',

  // {"name":"УИК №1748","data_id":4784014283629}, {"vrn":"4784014282346","fio":"Со Ен Хо ",                              "birthdate":"1957-12-20","position":"Член комиссии","vydv":"Политическая партия \"Российская объединенная демократическая партия \"ЯБЛОКО\""}
  'Ен Хо',
  // {"name":"УИК №2312","data_id":4784019327793}, {"vrn":"4784019331125","fio":"Ву Хан Ян Ламович","birthdate":"1992-12-21","position":"Член комиссии","vydv":"Санкт-Петербургское региональное отделение Политической партии ЛДПР - Либерально-демократической партии России"}
  'Хан Ян',

  // Медина Падрон Алексис Эддиевич
  'Падрон Алексис',
];

function parseName (originalName, source, venue) {
  // {"name":"УИК №1465","data_id":4784011343332}, {"vrn":"4784011340641","fio":"Аль - Харес Мтанус ","birthdate":"1956-05-17","position":"Член комиссии","vydv":"САНКТ-ПЕТЕРБУРГСКОЕ ГОРОДСКОЕ ОТДЕЛЕНИЕ политической партии \"КОММУНИСТИЧЕСКАЯ ПАРТИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ\""}
  // {"name":"УИК №1429","data_id":4784011343773}, {"vrn":"4784011341111","fio":"Гарузо- Мартынова Елена Сергеевна","birthdate":"1970-01-20","position":"Член комиссии","vydv":"Санкт-Петербургское региональное отделение политической партии ЛДПР - Либерально-демократической партии России"}
  const rawName = originalName.replace(/\s*-\s*/gi, '-');
  let firstIndex = rawName.indexOf(' ');
  let lastName = rawName.substring(0, firstIndex);
  if (['де', 'эль'].includes(lastName.toLowerCase())) {
    // {"name":"УИК №1884","data_id":4784028281811}, {"vrn":"4784028341043","fio":"Де Брейне Алина Владимировна","birthdate":"1975-02-06","position":"Член комиссии","vydv":"собрание избирателей по месту жительства"}
    // {"name":"УИК №2268","data_id":4784030199611}, {"vrn":"4784030251027","fio":"Эль Хафк Ирина Афлисовна","birthdate":"1965-07-11","position":"Член комиссии","vydv":"Региональная общественная организация поддержки и развития молодежного творчества \"Гаудеамус\""}
    firstIndex = rawName.indexOf(' ', firstIndex + 1);
    lastName = rawName.substring(0, firstIndex);
  }
  const name = {
    'last': lastName
  };
  let lastIndex = rawName.lastIndexOf(' ');
  if (lastIndex == firstIndex) {
    lastIndex = -1;
  }

  const foreignEndings = [
    'кызы', 'кзы', 'гызы', // female
    'оглы', 'оглу', 'улы', 'уулу' // male
  ];

  let middleName = lastIndex != -1 ? rawName.substring(lastIndex + 1) : null;
  let ending = null;
  if (middleName && (ending = findEnding(middleName.toLowerCase(), foreignEndings)) && middleName.length == ending.length) {
    lastIndex = Math.max(firstIndex, rawName.lastIndexOf(' ', lastIndex - 1));
    if (lastIndex == firstIndex) {
      throw Error('Weird middle name in ' + JSON.stringify(venue) + ': ' + JSON.stringify(rawName) + ' (' + JSON.stringify(source) + ')');
    }
    middleName = rawName.substring(lastIndex + 1);
  }
  name.first = lastIndex != -1 ? rawName.substring(firstIndex + 1, lastIndex) : rawName.substring(firstIndex + 1);
  if (middleName) {
    name.middle = middleName;
  }

  let firstNameParts = name.first.split(' ');
  if (firstNameParts.length != 1 && !firstNameWhiteList.includes(name.first))
    throw Error('Weird first name "' + name.first + '" in ' + JSON.stringify(venue) + ': ' + JSON.stringify(rawName) + ' (' + JSON.stringify(source) + '), middleName: ' + middleName);

  if (name.middle) {
    name.middle = name.middle.replace(/ё/g, 'е');
    foreignEndings.forEach((ending) => {
      name.middle = name.middle.replace(RegExp('(?<= )' + ending + '$', 'gi'), ending);
    });
  }
  name.last = name.last.replace(/ё/g, 'е');
  name.first = name.first.replace(/ё/g, 'е');

  let restoredName = '';
  for (const nameKey in name) {
    if (restoredName.length) restoredName += ' ';
    restoredName += name[nameKey];
  }
  if (originalName.replace(/\s*-\s*/gi, '-').trim() != restoredName.trim()) {
    name.raw = originalName;
  }
  return name;
}

function parseDate (rawDate, needOriginal, venue) {
  let date = null;
  if (rawDate.match(/^\d+-\d+-\d+$/gi)) {
    const dateArgs = rawDate.split("-").map((value) => parseInt(value)).reverse();
    date = {
      day: dateArgs[0],
      month: dateArgs[1],
      year: dateArgs[2]
    };
  } else if (rawDate.match(/^\d+\.\d+\.\d+ \d+:\d+:\d+$/gi)) {
    const dateArgs = rawDate.split(/[. :]/).map((value) => parseInt(value));
    date = {
      second: dateArgs[5],
      minute: dateArgs[4],
      hour: dateArgs[3],
      day: dateArgs[0],
      month: dateArgs[1],
      year: dateArgs[2]
    }
  }
  if (!date) {
    throw Error('Weird date in ' + JSON.stringify(venue) + ': ' + JSON.stringify(rawDate) + ' (' + JSON.stringify(source) + ')');
  }

  if (needOriginal) {
    return date;
  }

  const result = new Date(date.year, date.month - 1, date.day, date.hour || 0, date.minute || 0, date.second || 0);

  if (Date.now() < result) {
    throw Error('Passed date is from future');
  }

  return result.getTime();
}

function parseTime (time) {
  return time.split('.').map((item) => parseInt(item));
}

function parseTimeDeltaMinutes (startTime, endTime) {
  startTime = parseTime(startTime);
  endTime = parseTime(endTime);

  startTime = startTime[0] * 60 + startTime[1];
  endTime = endTime[0] * 60 + endTime[1];
  if (endTime < startTime)
    throw Error();
  return endTime - startTime;
}

function parseMember (rawMember, venue, district) {
  const member = {
    id: null,
    data_id: parseInt(rawMember.vrn),
    name: parseName(rawMember.fio, rawMember, venue),
    birthdate: parseDate(rawMember.birthdate, true, venue),
    district
  };
  if (member.birthdate) {
    member.age = ageDifference(new Date(2021, 8, 17).getTime(), member.birthdate);
  }
  const gender = guessGender(member.name);
  if (gender) {
    member.gender = gender;
  }
  member.father_name_guess = {
    last: gender === 'female' ? fromFemaleToMaleLastName(member.name.last) || member.name.last : member.name.last,
    first: guessFatherFirstName(member.name.middle)
  };
  return member;
}

function parseRole (rawRole, venue) {
  return ucfirst(rawRole);
}

function asVenue (context, level, id) {
  if (typeof level === 'object')
    return asVenue(context, level.type, level.id);
  switch (level) {
    case 'uik':
    case 'tik':
    case 'gik':
      return context.__('commission.short.' + level, {id, id_latin: context.isLatinLocale ? cyrillicToLatin(id) : null});
  }
  throw Error(level + ' ' + id);
}

function newMathTarget () {
  return { size: 0, sum: null, average: null, min: null, max: null, median: [] };
}

function addMathItem (stats, value, uikId) {
  if (stats.min === null || value < stats.min.value) {
    stats.min = {value: value, uik: uikId};
  } else if (value == stats.min.value) {
    addOrSet(stats.min, 'uik', uikId);
  }
  if (stats.max === null || value > stats.max.value) {
    stats.max = {value, uik: uikId};
  } else if (value == stats.max.value) {
    addOrSet(stats.max, 'uik', uikId);
  }
  stats.size++;
  stats.sum += value;
  stats.average = stats.sum / stats.size;
  stats.median.push({value, uik: uikId});
  const counts = stats.counts || (stats.counts = {});
  counts[value] = (counts[value] || 0) + 1;
}

function finishMathObject (stats) {
  if (!stats)
    return;
  if (stats.counts) {
    stats.counts = sortKeys(stats.counts, null, (a, b) => {
      a = parseFloat(a);
      b = parseFloat(b);
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }
  if (stats.median) {
    stats.median.sort((a, b) => a.value - b.value);
    stats.median = stats.median[Math.floor(stats.median.length / 2)];
  }
  ['min', 'max', 'median'].forEach((key) => {
    const result = stats[key];
    if (result) {
      const obj = {};
      obj['#' + (Array.isArray(result.uik) ? result.uik.join(',') : result.uik)] = result.value;
      stats[key] = obj;
    }
  });
}

function asVenueName (venue) {
  if (Array.isArray(venue))
    return venue.map((venue => asVenueName(venue))).join(',');
  if (!venue)
    throw Error(toJson(venue));
  switch (venue.type) {
    case 'uik':
      return 'УИК №' + venue.id;
    case 'tik':
      return 'ТИК №' + venue.id; // TODO tik
    case 'gik':
      return venue.id;
  }
  throw Error(toJson(venue));
}

function getVenueType (venue) {
  switch (venue.type) {
    case 'ГИК':
      return 'gik';
    case 'ТИК':
      return 'tik';
    case 'УИК':
      return 'uik';
  }
  throw Error(toJson(venue));
}

function copyVenue (object, from) {
  if (from.related_to) {
    if (!object.related_to) {
      object.related_to = {};
    }
    const keys = Object.keys(from.related_to);
    keys.forEach((key) => {
      const value = from.related_to[key];
      if (Array.isArray(value)) {
        value.forEach((item) => {
          addOrSet(object.related_to, key, item);
        })
      } else {
        addOrSet(object.related_to, key, value);
      }
    });
  }
}

function abroadKey (object) {
  return 'Голосование за рубежом'
}

function shortenDistrict (district) {
  return district === 'Голосование за рубежом' ? 'abroad' : district.replace(/ (район|district)$/gi, '');
}

function unshortenDistrict (district) {
  return district === 'abroad' ? 'Голосование за рубежом' : district + ' район';
}

function addVenue (object, venue, ignoreDistrict) {
  if (!venue)
    return;
  object = object || {};
  const type = getVenueType(venue);
  const relatedTo = object.related_to || (object.related_to = {});
  addOrSet(relatedTo, 'venue', {type, id: venue.id});
  addOrSet(relatedTo, type, venue.id);
  if (Array.isArray(venue.district)) {
    venue.district.forEach((district) => {
      addOrSet(relatedTo, 'district', district);
    });
  } else if (venue.district) {
    addOrSet(relatedTo, 'district', venue.district);
  }
  let parentVenue = venue;
  while (parentVenue = parentVenue.parent) {
    addOrSet(relatedTo, getVenueType(parentVenue), parentVenue.id);
  }
  return relatedTo;
}

// ANALYZERS

const MALE_NAMES = {
  first: [
    'Александр', 'Сергей', 'Дмитрий', 'Алексей', 'Андрей',
    'Владимир', 'Евгений', 'Михаил', 'Игорь', 'Павел', 'Пауль',
    'Николай', 'Максим', 'Юрий', 'Денис', 'Антон', 'Олег',
    'Роман', 'Иван', 'Виктор', 'Никита', 'Константин', 'Артем',
    'Кирилл', 'Илья', 'Виталий', 'Вадим', 'Вячеслав', 'Валерий',
    'Владислав', 'Анатолий', 'Даниил', 'Станислав', 'Руслан',
    'Василий', 'Георгий', 'Егор', 'Леонид', 'Борис', 'Петр',
    'Григорий', 'Ярослав', 'Валентин', 'Геннадий', 'Артур', 'Эдуард',
    'Глеб', 'Федор', 'Тимур', 'Филипп', 'Данила', 'Лев',
    'Тимофей', 'Семен', 'Герман', 'Ян', 'Яков', 'Степан', 'Марк',
    'Альберт', 'Всеволод', 'Данил', 'Богдан', 'Арсений',
    'Марат', 'Артемий', 'Аркадий', 'Матвей', 'Рустам', 'Давид', 'Захар',
    'Ростислав', 'Эльдар', 'Шамиль', 'Роберт', 'Ренат', 'Эрик',
    'Радик', 'Ефим', 'Рашид', 'Ильдар', 'Меружан',
    'Алан', 'Родион', 'Арсен', 'Ираклий', 'Лука', 'Амир', 'Хан',
    'Динар', 'Левон', 'Наиль', 'Азат', 'Эмиль', 'Рамиль', 'Эмиль', 'Рамиль',
    'Малик', 'Искандер', 'Владлен', 'Эльвин', 'Зураби', 'Герасим', 'Викрам',
    'Герасим', 'Савва', 'Ильмутдин', 'Даниэль', 'Умар', 'Георг', 'Христиан',
    'Грант', 'Канан', 'Макар', 'Хашими Саббир', 'Хашими Матиар', 'Темур',
    'Тарас', 'Вацлав', 'Гарри', 'Вадимир', 'Апти',
    'Сосланбек', 'Эдгар', 'Карим', 'Абдулкадыр', 'Жан', 'Эдвард', 'Николас',
    'Вачик', 'Равиль', 'Святослав', 'Карен', 'Рафаил', 'Тахир', 'Петър',
    'Абдухамид', 'Сорроб', 'Ен Хо', 'Мтанус', 'Шамс-Дин', 'Падрон Алексис',
    'Трофим'
  ]
};
const FEMALE_NAMES = {
  first: [
    'Елена', 'Татьяна', 'Ольга', 'Ирина', 'Наталья',
    'Светлана', 'Екатерина', 'Анна', 'Юлия', 'Марина',
    'Людмила', 'Мария', 'Анастасия', 'Галина', 'Надежда',
    'Наталия', 'Валентина', 'Виктория', 'Лариса', 'Оксана',
    'Любовь', 'Александра', 'Ксения', 'Дарья', 'Нина',
    'Евгения', 'Вера', 'Алла', 'Полина', 'Инна',
    'Маргарита', 'Елизавета', 'Тамара', 'Яна',
    'Валерия', 'Лидия', 'Вероника', 'Алина',
    'Дина', 'Севиль', 'Айгуль', 'Русудан', 'Нестани',
    'Кристина', 'Алена', 'Олеся', 'Лилия', 'Диана',
    'Алёна', 'Антонина', 'Жанна', 'Софья', 'Раиса',
    'Зоя', 'Арина', 'Карина', 'Алиса', 'Варвара',
    'Зинаида', 'Анжелика', 'Марианна', 'Дарина', 'Ярослава',
    'Майя', 'Эльвира', 'София', 'Ангелина', 'Виолетта',
    'Илона', 'Ульяна', 'Элина', 'Альбина', 'Алевтина',
    'Нелли', 'Анжела', 'Элла', 'Эльмира', 'Инесса',
    'Алеся', 'Инга', 'Роза', 'Юлиана', 'Кира', 'Регина',
    'Римма', 'Янина', 'Серафима', 'Таисия', 'Снежана',
    'Катерина', 'Василиса', 'Элеонора', 'Лейла', 'Сабина',
    'Милана', 'Дария', 'Эмма', 'Нонна', 'Влада', 'Станислава',
    'Альфия', 'Клавдия', 'Владислава', 'Динара', 'Лада', 'Рита',
    'Мадина', 'Венера', 'Галия', 'Наиля', 'Эвелина',
    'Гульнара', 'Алия', 'Зульфия', 'Вита', 'Лина', 'Жания', 'Каринэ',
    'Сюзанна', 'Зарема', 'Василина', 'Лиана', 'Румия', 'Альвина', 'Зарина',
    'Фатима', 'Эмилия', 'Христина', 'Нелля', 'Владлена', 'Мунира',
    'Луиза', 'Асия', 'Лилиана', 'Рената', 'Милена', 'Розалия', 'Зухра', 'Клара',
    'Альмира', 'Лусине', 'Прасковья', 'Настасья', 'Лолита', 'Амалия', 'Лия',
    'Диляра', 'Виталия', 'Каролина', 'Анфиса', 'Нино', 'Ирена', 'Талия', 'Лаура',
    'Гузель', 'Аделина', 'Леля', 'Белла', 'Залина', 'Патимат', 'Анаида', 'Кристинэ',
    'Ариадна', 'Нурия', 'Кадрия', 'Злата', 'Лана', 'Ярославна', 'Виталина', 'Ирма',
    'Шушаник', 'Лали', 'Эльза', 'Таиса', 'Леокадия', 'Астгик', 'Астрид', 'Шолбаана',
    'Рауза', 'Сусанна', 'Нинэль', 'Гульсун', 'Ариана', 'Ганна', 'Аделя', 'Тая', 'Луара',
    'Лоллита', 'Домникия', 'Аурика', 'Линура', 'Николь', 'Янна', 'Дианна', 'Любомира',
    'Марта', 'Люся', 'Кайт', 'Анита', 'Жанетта', 'Даляль'
  ]
};

function guessChildMiddleName (firstName) {
  if (!firstName) {
    return null;
  }
  const middleNames = [firstName];

  const foreignEndings = [
    ' кызы', ' кзы', ' гызы', // female
    ' оглы', ' оглу', ' улы', ' уулу' // male
  ];
  foreignEndings.forEach((ending) => {
    middleNames.push(firstName + ending);
  });

  let ending;
  let array;

  array = ['ий'];
  if (ending = findEnding(firstName, array)) {
    const part = firstName.substring(0, firstName.length - ending.length);
    // Юрий, Геннадий
    const endings = [
      'ьевич', 'иевич', // -> Юрьевич, Юриевич, Геннадьевич, Геннадиевич
      'ьевна', 'иевна', // -> Юрьевна, Юриевна, Геннадьевна, Геннадиевна
    ];
    endings.forEach((ending) => {
      middleNames.push(part + ending);
    });
    return middleNames;
  }

  array = ['ил'];
  if (ending = findEnding(firstName, array)) {
    const part = firstName.substring(0, firstName.length - ending.length);
    // Михаил
    const endings = [
      'йлович', 'илович', // -> Михайлович, Михаилович
      'йловна', 'иловна', // -> Михайловна, Михаилович
    ];
    endings.forEach((ending) => {
      middleNames.push(part + ending);
    });
    return middleNames;
  }

  array = ['ей'];
  if (ending = findEnding(firstName, array)) {
    const part = firstName.substring(0, firstName.length - ending.length);
    // Алексей, Андрей
    const endings = [
      'еевич', // -> Алексеевич, Андреевич
      'еевна', // -> Алексеевна, Андреевна
    ];
    endings.forEach((ending) => {
      middleNames.push(part + ending);
    });
    return middleNames;
  }

  // Владимир, Олег
  const endings = [
    'ович', // -> Владимирович, Олегович
    'овна', // -> Владимировна, Олеговна
  ];
  endings.forEach((ending) => {
    middleNames.push(firstName + ending);
  });
  return middleNames;
}

function guessFatherFirstName (middleName) {
  if (!middleName) {
    return null;
  }
  const foreignEndings = [
    ' кызы', ' кзы', ' гызы', // female
    ' оглы', ' оглу', ' улы', ' уулу' // male
  ];

  let ending, array;

  if (ending = findEnding(middleName.toLowerCase(), foreignEndings)) {
    return middleName.substring(0, middleName.length - ending.length);
  }

  array = ['ьевна', 'ьевич']; // Юрьевна, Юрьевич -> Юрий
  if (ending = findEnding(middleName, array)) {
    return middleName.substring(0, middleName.length - ending.length) + 'ий';
  }
  array = ['йловна', 'йлович']; // Михайловна, Михайлович -> Михаил
  if (ending = findEnding(middleName, array)) {
    return middleName.substring(0, middleName.length - ending.length) + 'ил';
  }
  array = ['иловна', 'илович']; // Данииловна, Даниилович -> Даниил
  if (ending = findEnding(middleName, array)) {
    return middleName.substring(0, middleName.length - ending.length) + 'ил';
  }
  array = ['ловна', 'лович']; // Павловна, Павлович -> Павел
  if (ending = findEnding(middleName, array)) {
    return middleName.substring(0, middleName.length - ending.length) + 'ел';
  }
  array = ['ьвовна', 'ьвович']; // Львовна, Львович -> Лев
  if (ending = findEnding(middleName, array)) {
    return middleName.substring(0, middleName.length - ending.length) + 'ев';
  }
  array = ['ивна']; // Искаливна -> Искалив
  if (ending = findEnding(middleName, array)) {
    return middleName.substring(0, middleName.length - ending.length) + 'ив';
  }
  array = ['вович', 'вовна']; // Саввович, Саввовна
  if (ending = findEnding(middleName, array)) {
    return middleName.substring(0, middleName.length - ending.length) + 'ва';
  }
  array = ['овна', 'ович']; // Викторовна, Викторович -> Виктор
  if (ending = findEnding(middleName, array)) {
    return middleName.substring(0, middleName.length - ending.length);
  }
  array = ['евна', 'евич']; // Николаевна, Николаевич -> Николай
  if (ending = findEnding(middleName, array)) {
    const guess = middleName.substring(0, middleName.length - ending.length);
    if (guess.match(/[аяэеёиоую]$/gi)) {
      return guess + 'й';
    } else if (guess.match(/ц$/gi)) {
      return guess; // Францевна, Францевич -> Франц
    } else {
      return guess + 'ь'; // Игоревич, Игоревна -> Игорь
    }
  }
  array = ['минична', 'мич']; // Фоминична, Фомич -> Фома, Кузьминична, Кузьмич -> Кузьма
  if (ending = findEnding(middleName, array)) {
    return middleName.substring(0, middleName.length - ending.length) + 'ма';
  }
  array = ['ьинична', 'ьич']; // Ильич, Ильинична -> Илья
  if (ending = findEnding(middleName, array)) {
    return middleName.substring(0, middleName.length - ending.length) + 'ья';
  }
  return null;
}

function fromMaleToFemaleLastName (lastName) {
  if (!lastName) {
    return lastName;
  }
  const map = [
    {
      regexp: /(ев|ов|ин)$/gi, // Сергеев, Рогозин, Хрипунков
      replacement: '$1а'
    },
    {
      regexp: /(в)ой/gi, // Буртовой
      replacement: '$1ая'
    },
    {
      regexp: /(к)ий$/gi, // Перекопский
      replacement: '$1ая'
    },
    {
      regexp: /ий$/gi, // Зимний -> Зимняя
      replacement: '$1яя'
    },
    {
      regexp: /ый$/gi, // Холодный -> Холодная
      replacement: '$1ая'
    }
  ];
  for (let i = 0; i < map.length; i++) {
    const attempt = map[i];
    const femaleLastName = lastName.replace(attempt.regexp, attempt.replacement);
    if (femaleLastName != lastName) {
      return femaleLastName;
    }
  }

  return lastName;
}

function fromFemaleToMaleLastName (lastName) {
  if (!lastName) {
    return lastName;
  }

  const map = [
    {
      regexp: /(ев|ов|ин)а$/gi, // Сергеева, Рогозина, Хрипункова
      replacement: '$1'
    },
    {
      regexp: /(в)ая/gi, // Буртовая
      replacement: '$1ой'
    },
    {
      regexp: /(к)ая$/gi, // Перекопская
      replacement: '$1ий'
    },
    {
      regexp: /яя$/gi, // Зимняя -> Зимний
      replacement: '$1ий'
    },
    {
      regexp: /ая$/gi, // Холодная -> Холодный
      replacement: '$1ый'
    }
  ];

  for (let i = 0; i < map.length; i++) {
    const attempt = map[i];
    const maleLastName = lastName.replace(attempt.regexp, attempt.replacement);
    if (maleLastName != lastName) {
      return maleLastName;
    }
  }

  return lastName;
}

function guessGender (name) {
  if (!name)
    return null;

  const nameKeys = ['first', 'middle', 'last'];

  const keys = Object.keys(name).filter((key) =>
    nameKeys.includes(key)
  );
  if (keys.length == 0)
    return null;
  if (keys.length > 1) {
    const guesses = {};
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
      const key = keys[keyIndex];
      const query = {};
      query[key] = name[key];
      const guess = guessGender(query);
      if (guess) {
        guesses[key] = guess;
      }
    }
    const results = [...new Set(Object.values(guesses))];
    if (results.length > 1) {
      throw Error('Inconsistent guesses for ' + JSON.stringify(name) + ': ' + JSON.stringify(guesses));
    }
    return results.length == 1 ? results[0] : null;
  }

  const guesses = [
    {data: FEMALE_NAMES, answer: 'female'},
    {data: MALE_NAMES, answer: 'male'}
  ];
  for (let guessIndex = 0; guessIndex < guesses.length; guessIndex++) {
    const guess = guesses[guessIndex];
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
      const nameKey = keys[keyIndex];
      const array = guess.data[nameKey];
      const genderName = name[nameKey];
      if (genderName && array) {
        if (array.includes(genderName)) {
          return guess.answer;
        }
        const genderNameParts = genderName.split(RegExp('[ \-]+'));
        if (genderNameParts.length > 1) {
          for (let z = 0; z < genderNameParts.length; z++) {
            if (array.includes(genderNameParts[z])) {
              return guess.answer;
            }
          }
        }
      }
    }
  }

  if (name.last && name.last.match(/(овна|евна|ская)$/gi)) {
    return 'female';
  }
  if (name.middle) {
    const foreignFemaleEndings = [
      'кызы', 'кзы', 'гызы', // female
    ];
    if (name.middle.match(RegExp('[ \\-](?:' + foreignFemaleEndings.join('|') + ')$', 'gi'))) {
      return 'female';
    }
    const foreignMaleEndings = [
      'оглы', 'оглу', 'улы', 'уулу' // male
    ];
    if (name.middle.match(RegExp('[ \\-](?:' + foreignMaleEndings.join('|') + ')$', 'gi'))) {
      return 'male';
    }
    if (name.middle.match(/(овна|евна|нична)$/gi)) {
      return 'female';
    }
    if (name.middle.match(/(ович|евич)$/gi)) {
      return 'male';
    }
  }
  return null;
}

function convertToDate (date) {
  switch (typeof date) {
    case 'number':
      return new Date(date);
    case 'object':
      if (date.year && date.month && date.day) {
        return new Date(date.year, date.month - 1, date.day, date.hour || 0, date.minute || 0, date.day || 0);
      }
      break;
  }
  throw Error('Invalid date object: ' + toJson(date));
}

function dateDifference (fromDate, toDate, format) {
  return (fromDate && toDate) ?
    moment(convertToDate(fromDate))
      .diff(convertToDate(toDate), format) :
    false;
}

function ageDifference (whoDate, fromDate) {
  return dateDifference(whoDate, fromDate, 'years');
}

function isOlder (whoDate, fromDate) {
  return dateDifference(whoDate, fromDate) < 0;
}

function isParentCommission (data, commission, parent, maxLevel) {
  maxLevel = maxLevel || 1;
  while (commission && commission.parent_commission && maxLevel-- > 0) {
    if (commission.parent_commission.type === parent.type && commission.parent_commission.id === parent.id)
      return true;
    switch (commission.parent_commission.type) {
      case 'gik':
        commission = data.gik;
        break;
      case 'tik':
        commission = data.gik.tiks[commission.parent_commission.id];
        break;
      default:
        commission = null;
        break;
    }
  }
  return false;
}

function getEvidenceScore (evidenceType) {
  if (!evidenceType) {
    return 0;
  }
  const array = [
    'same_commission',
    'same_building',
    'works_in_parent_commission',
    'works_in_ancestor_commission',
    'works_in_child_commission',
    'works_in_parent_district_commission',
    'works_in_child_district_commission',
    'same_parent_commission',
    'same_electoral_district',
    'similar_role',
    'strong_role',
    'same_district',
    'works_in_close_commission',
    'works_in_descendant_commission'
  ];
  const index = array.indexOf(evidenceType);
  if (index === -1)
    throw Error('Unknown evidence: ' + evidenceType);
  return (array.length - index);
}

function evidenceToSummaryKey (evidenceType) {
  if (!evidenceType) {
    return 'unknown';
  }
  const map = {
    'same_commission': 'siblings_in_commission',
    'same_building': 'siblings_in_building',
    'works_in_parent_commission': 'siblings_in_parent_commission',
    'works_in_child_commission': 'siblings_in_child_commission',
    'works_in_descendant_commission': 'siblings_in_descendant_commission',
    'works_in_ancestor_commission': 'siblings_in_ancestor_commission',
    'works_in_parent_district_commission': 'siblings_in_parent_district_commission',
    'works_in_child_district_commission': 'siblings_in_child_district_commission',
    'same_parent_commission': 'siblings_under_mutual_commission',
    'same_electoral_district': 'siblings_in_same_electoral_district',
    'similar_role': 'siblings_with_similar_role',
    'strong_role': 'siblings_with_strong_role',
    'same_district': 'siblings_in_same_district',
    'works_in_close_commission': 'siblings_in_close_commissions'
  };
  const summaryKey = map[evidenceType];
  if (!summaryKey)
    throw Error('Unknown evidence type: ' + evidenceType);
  return summaryKey;
}

function buildRelativeMap (data, targetMember, relativeCandidates, candidateMemberIds, onlyStrong) {
  const candidatesMap = {};
  candidateMemberIds.forEach((candidateMemberId) => {
    if (targetMember.id === candidateMemberId || candidatesMap[candidateMemberId]) // self or duplicate
      return;
    const relativeCandidate = data.members[candidateMemberId];
    const relativeData = {
      strong_evidence: false,
      age_difference: ageDifference(targetMember.birthdate, relativeCandidate.birthdate),
      name: relativeCandidate.name
    };

    const targetCommissions = allCommissionsOf(data, targetMember);
    const relativeCommissions = allCommissionsOf(data, relativeCandidate);

    let evidences = [];
    let minimumDistance = -1;

    targetCommissions.forEach((targetCommission) => {
      const targetAddress = data.addresses[targetCommission.address_id];
      relativeCommissions.forEach((relativeCommission) => {
        const relativeAddress = data.addresses[relativeCommission.address_id];

        const isSameCommission = targetCommission.type === relativeCommission.type && targetCommission.id === relativeCommission.id;
        const isSameBuilding = isSameCommission || (targetCommission.address_id && (targetCommission.address_id === relativeCommission.address_id || sameBuilding(targetAddress, relativeAddress)));
        const distanceBetweenCommissions = isSameBuilding ? 0 : distanceTo(targetAddress.location, relativeAddress.location);
        if (minimumDistance === -1 || minimumDistance > distanceBetweenCommissions) {
          minimumDistance = distanceBetweenCommissions;
        }

        let strongEvidence = null;
        if (isSameCommission) {
          strongEvidence = 'same_commission';
        } else if (isSameBuilding) {
          strongEvidence = 'same_building';
        } else if (isParentCommission(data, targetCommission, relativeCommission)) {
          strongEvidence = 'works_in_parent_commission';
        } else if (isParentCommission(data, relativeCommission, targetCommission)) {
          strongEvidence = 'works_in_child_commission';
        } else if (targetCommission.type === 'uik' && relativeCommission.type === 'tik' && targetCommission.district === relativeCommission.district) {
          strongEvidence = 'works_in_parent_district_commission';
        } else if (targetCommission.type === 'tik' && relativeCommission.type === 'uik' && targetCommission.district === relativeCommission.district) {
          strongEvidence = 'works_in_child_district_commission';
        } else if (relativeCommission.type === targetCommission.type) {
          if (!relativeCommission.electoral_districts) {
            throw Error(toJson(relativeCommission.type + ' ' + targetCommission.id));
          }
          if (!targetCommission.electoral_districts) {
            throw Error(toJson(targetCommission.type + ' ' + targetCommission.id));
          }
          if (relativeCommission.parent_commission && targetCommission.parent_commission &&
            relativeCommission.parent_commission.type === targetCommission.parent_commission.type &&
            relativeCommission.parent_commission.id === targetCommission.parent_commission.id) {
            strongEvidence = 'same_parent_commission';
          } else if (relativeCommission.type !== 'uik') {
            strongEvidence = 'similar_role';
          } else if (!onlyStrong) {
            Object.keys(relativeCommission.electoral_districts).forEach((electoralDistrictType) => {
              if (targetCommission.electoral_districts[electoralDistrictType] === relativeCommission.electoral_districts[electoralDistrictType]) {
                strongEvidence = 'same_electoral_district';
              }
            });
          }
        } else if (onlyStrong && relativeCommission.type == 'tik') {
          strongEvidence = 'strong_role';
        }
        if (!strongEvidence && !onlyStrong) {
          if (targetCommission.district === relativeCommission.district) {
            strongEvidence = 'same_district';
          } else if (distanceBetweenCommissions <= 1500) {
            strongEvidence = 'works_in_close_commission';
          }
          if (!strongEvidence) {
            if (isParentCommission(data, targetCommission, relativeCommission, 5)) {
              strongEvidence = 'works_in_ancestor_commission';
            } else if (isParentCommission(data, relativeCommission, targetCommission, 5)) {
              strongEvidence = 'works_in_descendant_commission';
            }
          }
        }
        if (strongEvidence) {
          evidences.push(strongEvidence);
        }
      });
    });

    evidences.sort((a, b) => {
      const aScore = getEvidenceScore(a);
      const bScore = getEvidenceScore(b);
      if (aScore != bScore) {
        return aScore < bScore ? 1 : -1;
      }
      return a === b ? 0 : a < b ? -1 : 1;
    });
    // evidences = [...new Set(evidences)];

    const strongestEvidence = evidences.length ? evidences[0] : null;
    if (strongestEvidence) {
      relativeData.strong_evidence = strongestEvidence;
    } else {
      delete relativeData.strong_evidence;
    }

    if (!strongestEvidence && onlyStrong) {
      return;
    }

    const summaryKey = evidenceToSummaryKey(strongestEvidence);
    if (summaryKey) {
      const sum = relativeCandidates.summary[summaryKey] || (relativeCandidates.summary[summaryKey] = {
        count: 0,
        ids: null
      });
      sum.count++;
      addOrSet(sum, 'ids', candidateMemberId);
    }
    if (minimumDistance != -1) {
      relativeData.distance = minimumDistance;
    }
    relativeData.district = relativeCandidate.district;
    copyVenue(relativeData, relativeCandidate);
    relativeCandidates.summary.total_guess_count++;
    if (strongestEvidence) {
      relativeCandidates.summary.strong_guesses[strongestEvidence] = (relativeCandidates.summary.strong_guesses[strongestEvidence] || 0) + 1;
    }
    candidatesMap[candidateMemberId] = relativeData;
  });
  return !empty(candidatesMap) ? candidatesMap : null;
}

function findPlace (protocol, place) {
  const entries = protocol.entries;
  if (!entries)
    throw Error();
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const candidate = entries[entryIndex];
    if (candidate.official_result.place === place || Math.floor(candidate.official_result.place) === place)
      return candidate;
  }
  throw Error('place not found: ' + place);
}

function findTopWinner (entries, winner) {
  if (Array.isArray(winner.id)) {
    let maxCandidate = null;
    for (let i = 0; i < winner.valid_percentage.length; i++) {
      let candidate = findCandidate(entries, winner.id[i], winner.position[i]);
      if (!maxCandidate || maxCandidate.official_result.votes_count < candidate.official_result.votes_count) {
        maxCandidate = candidate;
      }
    }
    return maxCandidate;
  } else {
    return findCandidate(entries, winner.id, winner.position);
  }
}

function findCandidate (entries, candidateId, position) {
  if (typeof position === 'number') {
    const candidate = entries[position - 1];
    if (candidateId == (candidate.party_id || candidate.candidate_id))
      return candidate;
  }
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const candidate = entries[entryIndex];
    if (candidateId == (candidate.party_id || candidate.candidate_id))
      return candidate;
  }
  throw Error('candidateId: ' + toJson(candidateId) + ', position: ' + position + ', data:\n' + toJson(entries));
}

function bumpRelativeStats (totalStats, member, relativeCandidates, isCommon) {
  totalStats.relative_guesses.members_with_guesses++;

  const bumpVenue = (venue) => {
    const count = (totalStats.relative_guesses.commissions[venue] = ((totalStats.relative_guesses.commissions[venue] || 0) + 1));
    if (count == 1) {
      totalStats.relative_guesses.commissions.total_count++;
    }
  };

  if (Array.isArray(member.related_to.venue)) {
    member.related_to.venue.map((venue) => asVenueName(venue)).forEach((venue) => {
      bumpVenue(venue);
    });
  } else {
    bumpVenue(asVenueName(member.related_to.venue));
  }

  totalStats.relative_guesses.total_count += relativeCandidates.summary.total_guess_count;
  Object.keys(relativeCandidates.summary.strong_guesses).forEach((key) => {
    const value = relativeCandidates.summary.strong_guesses[key];
    if (isCommon) {
      relativeCandidates.summary.strong_guess_count++;
    }
    if (!totalStats.relative_guesses.strong_count[key]) {
      totalStats.relative_guesses.strong_count[key] = value;
    } else {
      totalStats.relative_guesses.strong_count[key] += value;
    }
  });
}

function findSiblingConnections (data) {
  if (empty(data.members))
    throw Error();

  const totalStats = {
    total_count: 0,
    gender: {
      female: 0,
      male: 0
    },
    age: {},
    by_role: {},
    relative_guesses: {
      total_count: 0,
      members_with_guesses: 0,
      strong_count: {},
      commissions: {
        total_count: 0
      }
    }
  };

  const nameTree = {
    // child -> parent: lastToFirst[child_last_name+male][father_name_guess]
    lastToFirst: { summary: { total_count: 0, unique_count: 0 } },

    // parent -> child: middleToLast[child_middle_name_guess][parent_last_name]
    middleToLast: { summary: { total_count: 0, unique_count: 0 } },

    fatherLastToFirst: { summary: { total_count: 0, unique_count: 0 } },

    femaleLast: { summary: { total_count: 0, unique_count: 0 } },
    maleLast: { summary: { total_count: 0, unique_count: 0 } },
  };

  // Build map for quick lookup
  for (const memberId in data.members) {
    if (!data.members.hasOwnProperty(memberId))
      continue;

    const member = data.members[memberId];

    totalStats.total_count++;
    if (member.gender) {
      totalStats.gender[member.gender]++;
    }
    if (member.age) {
      const ageObj = totalStats.age[member.age] || (totalStats.age[member.age] = {
        total_count: 0,
        female: 0,
        male: 0
      });
      ageObj.total_count++;
      if (member.gender) {
        ageObj[member.gender]++;
      }
    }
    const byRole = totalStats.by_role[member.role_id] || (totalStats.by_role[member.role_id] = {
      total_count: 0,
      female: 0,
      male: 0,
      age: {}
    });
    byRole.total_count++;
    if (member.gender) {
      byRole[member.gender]++;
    }
    if (member.age) {
      const ageObj = byRole.age[member.age] || (byRole.age[member.age] = {
        total_count: 0,
        female: 0,
        male: 0
      });
      ageObj.total_count++;
      if (member.gender) {
        ageObj[member.gender]++;
      }
    }

    const id = parseInt(memberId);
    const firstName = member.name.first || '_';
    const lastName = member.name.last || '_';
    const middleName = member.name.middle || '_';

    const fatherFirstName = member.father_name_guess.first || '_';
    const fatherLastName = member.father_name_guess.last || '_';

    let map, array;

    if (member.gender === 'female') {
      array = nameTree.femaleLast[lastName];
      if (!array) {
        nameTree.femaleLast[lastName] = array = [];
        nameTree.femaleLast.unique_count++;
      }
      array.push(id);
      nameTree.femaleLast.total_count++;
    } else {
      array = nameTree.maleLast[lastName];
      if (!array) {
        nameTree.maleLast[lastName] = array = [];
        nameTree.maleLast.unique_count++;
      }
      array.push(id);
      nameTree.maleLast.total_count++;
    }

    map = nameTree.lastToFirst[lastName] || (nameTree.lastToFirst[lastName] = {});
    array = map[firstName];
    if (!array) {
      map[firstName] = array = [];
      nameTree.lastToFirst.unique_count++;
    }
    array.push(id);
    nameTree.lastToFirst.total_count++;

    map = nameTree.middleToLast[middleName] || (nameTree.middleToLast[middleName] = {});
    array = map[lastName];
    if (!array) {
      map[lastName] = array = [];
      nameTree.middleToLast.unique_count++;
    }
    array.push(id);
    nameTree.middleToLast.total_count++;

    map = nameTree.fatherLastToFirst[fatherLastName] || (nameTree.fatherLastToFirst[fatherLastName] = {});
    array = map[fatherFirstName];
    if (!array) {
      map[fatherFirstName] = array = [];
      nameTree.fatherLastToFirst.unique_count++;
    }
    array.push(id);
    nameTree.fatherLastToFirst.total_count++;
  }
  Object.keys(totalStats.gender).forEach((gender) => {
    const result = totalStats.gender[gender];
    const ratio = totalStats.total_count > 0 ? result / totalStats.total_count * 100.0 : 0;
    totalStats.gender[gender] = {
      count: result,
      percentage: ratio
    };
  });
  Object.keys(totalStats.age).forEach((age) => {
    const obj = totalStats.age[age];
    obj.percentage = obj.total_count / totalStats.total_count * 100.0;
  });
  Object.keys(totalStats.by_role).forEach((roleId) => {
    Object.keys(totalStats.gender).forEach(((gender) => {
      const stats = totalStats.by_role[roleId];
      const result = stats[gender];
      const ratio = stats.total_count > 0 ? result / stats.total_count * 100.0 : 0;
      stats[gender] = {
        count: result,
        percentage: ratio,
        global_percentage: totalStats.total_count > 0 ? result / totalStats.total_count * 100.0 : 0
      }
    }));
  });

  for (const targetMemberId in data.members) {
    if (!data.members.hasOwnProperty(targetMemberId))
      continue;

    const targetMember = data.members[targetMemberId];

    const relativeCandidates = targetMember.relative_candidates || {
      summary: {
        total_guess_count: 0,
        strong_guess_count: 0,
        strong_guesses: {}
      }
    };

    // Children's father: middle name -> first name + last name + age diff
    let fatherMemberIds = [];
    if (targetMember.name.middle) {
      // Father name
      const fatherFirstNameGuess = guessFatherFirstName(targetMember.name.middle);
      let fatherLastName = targetMember.name.last;

      // Candidate
      if (fatherFirstNameGuess) {
        fatherMemberIds = fatherMemberIds.concat(nameTree.lastToFirst[fatherLastName][fatherFirstNameGuess] || []);
        if (targetMember.gender === 'female') {
          fatherLastName = fromFemaleToMaleLastName(targetMember.name.last);
          if (fatherLastName && fatherLastName !== targetMember.name.last) {
            const byLastName = nameTree.lastToFirst[fatherLastName];
            if (byLastName) {
              fatherMemberIds = fatherMemberIds.concat(byLastName[fatherFirstNameGuess] || []);
            }
          }
        }
      }

      // Filter potential fathers by age
      fatherMemberIds = fatherMemberIds.filter((candidateMemberId) => {
        if (candidateMemberId === targetMemberId)
          return false;
        const ageDiff = ageDifference(
          targetMember.birthdate,
          data.members[candidateMemberId].birthdate
        );
        // require father to be at least 16 years old, and not older than 90
        return ageDiff >= 16 && ageDiff < 90;
      });
    }

    // Father's children: first name -> middle name + last name + age diff
    let fathersChildrenMemberIds = [];
    if (targetMember.gender === 'male') {
      const childMiddleNameGuesses = guessChildMiddleName(targetMember.name.first);
      if (childMiddleNameGuesses) {
        childMiddleNameGuesses.forEach((middleName) => {
          const byLastName = nameTree.middleToLast[middleName];
          if (byLastName) {
            const sonIds = byLastName[targetMember.name.last];
            const femaleLastName = fromMaleToFemaleLastName(targetMember.name.last);
            const daughterIds = femaleLastName && femaleLastName != targetMember.name.last ? byLastName[femaleLastName] : null;
            fathersChildrenMemberIds = fathersChildrenMemberIds.concat(sonIds || []).concat(daughterIds || []);
          }
        });
      }

      // Filter potential children by age
      fathersChildrenMemberIds = fathersChildrenMemberIds.filter((candidateMemberId) => {
        if (candidateMemberId === targetMemberId)
          return false;
        const fatherCandidate = data.members[candidateMemberId];
        if (fatherCandidate.gender !== 'male') {
          return false;
        }
        const ageDiff = -ageDifference(
          targetMember.birthdate,
          fatherCandidate.birthdate
        );
        // require child to be at least 16 years younger
        return ageDiff >= 16 && ageDiff < 90;
      });
    }

    // Mother's children: lookup just by the last name
    let mothersChildrenMemberIds = [];
    if (targetMember.gender === 'female') {
      mothersChildrenMemberIds = nameTree.femaleLast[targetMember.name.last] || [];
      mothersChildrenMemberIds = mothersChildrenMemberIds.concat(nameTree.maleLast[targetMember.name.last] || []);

      const maleLastName = fromFemaleToMaleLastName(targetMember.name.last);
      if (maleLastName && maleLastName !== targetMember.name.last) {
        mothersChildrenMemberIds = mothersChildrenMemberIds.concat(nameTree.maleLast[maleLastName] || []);
      }

      mothersChildrenMemberIds = mothersChildrenMemberIds.filter((candidateMemberId) => {
        if (candidateMemberId === targetMemberId) {
          return false;
        }
        const ageDiff = -ageDifference(
          targetMember.birthdate,
          data.members[candidateMemberId].birthdate
        );
        // require child to be at least 16 years younger
        return ageDiff >= 16 && ageDiff < 90;
      });
    }

    // Siblings lookup: same last and middle name
    let siblingsMemberIds = [];
    if (targetMember.name.middle) {
      siblingsMemberIds = nameTree.middleToLast[targetMember.name.middle][targetMember.name.last] || [];

      const fatherFirstName = targetMember.father_name_guess.first;
      const middleNameGuesses = guessChildMiddleName(fatherFirstName) || [];
      if (!middleNameGuesses.includes(targetMember.name.middle)) {
        middleNameGuesses.push(targetMember.name.middle);
      }

      let oppositeLastName = targetMember.gender === 'female' ? fromFemaleToMaleLastName(targetMember.name.last) : fromMaleToFemaleLastName(targetMember.name.last);
      if (oppositeLastName === targetMember.name.last) {
        oppositeLastName = null;
      }

      middleNameGuesses.forEach((middleNameGuess) => {
        const byLastName = nameTree.middleToLast[middleNameGuess];
        if (byLastName) {
          let memberIds = byLastName[targetMember.name.last];
          if (memberIds) {
            siblingsMemberIds = siblingsMemberIds.concat(memberIds);
          }
          if (oppositeLastName) {
            memberIds = byLastName[oppositeLastName];
            if (memberIds) {
              siblingsMemberIds = siblingsMemberIds.concat(memberIds);
            }
          }
        }
      });

      if (targetMember.father_name_guess.last && targetMember.father_name_guess.first) {
        const memberIds = nameTree.fatherLastToFirst[targetMember.father_name_guess.last][fatherFirstName];
        if (memberIds) {
          siblingsMemberIds = siblingsMemberIds.concat(memberIds);
        }
      }

      // Filter siblings whom are already detected as other kind of relative
      siblingsMemberIds = siblingsMemberIds.filter((candidateMemberId) => {
        return !(candidateMemberId === targetMemberId || fatherMemberIds.includes(candidateMemberId) || fathersChildrenMemberIds.includes(candidateMemberId));
      });
    }

    let motherMemberIds = [];
    if (targetMember.name.last) {
      motherMemberIds = nameTree.femaleLast[targetMember.name.last] || [];
      if (targetMember.gender === 'male') {
        const femaleLastName = fromMaleToFemaleLastName(targetMember.name.last);
        if (femaleLastName && femaleLastName !== targetMember.name.last) {
          motherMemberIds = motherMemberIds.concat(nameTree.femaleLast[femaleLastName] || []);
        }
      }
      motherMemberIds = motherMemberIds.filter((candidateMemberId) => {
        if (candidateMemberId === targetMemberId) {
          return false;
        }
        const motherCandidate = data.members[candidateMemberId];
        if (motherCandidate.gender !== 'female') {
          return false;
        }
        const ageDiff = ageDifference(
          targetMember.birthdate,
          motherCandidate.birthdate
        );
        // require mother to be at least 16 years old, and not older than 90
        return ageDiff >= 16 && ageDiff < 90;
      });
    }

    motherMemberIds = motherMemberIds.filter((candidateMemberId) => {
      return !(candidateMemberId === targetMemberId || siblingsMemberIds.includes(candidateMemberId));
    });
    mothersChildrenMemberIds = mothersChildrenMemberIds.filter((candidateMemberId) => {
      return !(candidateMemberId === targetMemberId || siblingsMemberIds.includes(candidateMemberId));
    });

    let spouseMemberIds = [];
    if (targetMember.name.last) {
      spouseMemberIds = (targetMember.gender === 'female' ? nameTree.maleLast : nameTree.femaleLast)[targetMember.name.last] || [];
      if (targetMember.gender === 'female') {
        const maleLastName = fromFemaleToMaleLastName(targetMember.name.last);
        if (maleLastName && maleLastName !== targetMember.name.last) {
          spouseMemberIds = spouseMemberIds.concat(nameTree.maleLast[maleLastName] || []);
        }
      } else {
        const femaleLastName = fromMaleToFemaleLastName(targetMember.name.last);
        if (femaleLastName && femaleLastName !== targetMember.name.last) {
          spouseMemberIds = spouseMemberIds.concat(nameTree.femaleLast[femaleLastName] || []);
        }
      }
    }
    spouseMemberIds = spouseMemberIds.filter((candidateMemberId) => {
      if (candidateMemberId === targetMemberId ||
        fatherMemberIds.includes(candidateMemberId) ||
        fathersChildrenMemberIds.includes(candidateMemberId) ||
        motherMemberIds.includes(candidateMemberId) ||
        mothersChildrenMemberIds.includes(candidateMemberId) ||
        siblingsMemberIds.includes(candidateMemberId)) {
        return false;
      }
      const spouseCandidate = data.members[candidateMemberId];
      const ageDiff = ageDifference(
        targetMember.birthdate,
        spouseCandidate.birthdate
      );
      return Math.abs(ageDiff) <= 20;
    });

    // Maps
    const spouseMap = buildRelativeMap(data, targetMember, relativeCandidates, spouseMemberIds, true);
    if (spouseMap) {
      relativeCandidates.spouse = spouseMap;
    }
    const fathersMap = buildRelativeMap(data, targetMember, relativeCandidates, fatherMemberIds);
    if (fathersMap) {
      relativeCandidates.father = fathersMap;
    }
    const fathersChildrenMap = buildRelativeMap(data, targetMember, relativeCandidates, fathersChildrenMemberIds);
    if (fathersChildrenMap) {
      relativeCandidates.children = fathersChildrenMap;
    }
    const mothersChildrenMap = buildRelativeMap(data, targetMember, relativeCandidates, mothersChildrenMemberIds, true);
    if (mothersChildrenMap) {
      relativeCandidates.children = mothersChildrenMap;
    }
    const mothersMap = buildRelativeMap(data, targetMember, relativeCandidates, motherMemberIds, true);
    if (mothersMap) {
      relativeCandidates.mother = mothersMap;
    }
    const siblingsMap = buildRelativeMap(data, targetMember, relativeCandidates, siblingsMemberIds);
    if (siblingsMap) {
      relativeCandidates.siblings = siblingsMap;
    }

    if (relativeCandidates.summary.total_guess_count) {
      targetMember.relative_candidates = relativeCandidates;
    }
  }

  // Look for any missed relationships
  const reverseStrongEvidence = {
    'works_in_child_commission': 'works_in_parent_commission',
    'works_in_parent_commission': 'works_in_child_commission',
    'works_in_ancestor_commission': 'works_in_descendant_commission',
    'works_in_descendant_commission': 'works_in_ancestor_commission',
    'works_in_child_district_commission': 'works_in_parent_district_commission',
    'works_in_parent_district_commission': 'works_in_child_district_commission'
  };
  for (const targetMemberId in data.members) {
    if (!data.members.hasOwnProperty(targetMemberId))
      continue;
    const targetMember = data.members[targetMemberId];
    if (!targetMember.relative_candidates) {
      continue;
    }
    for (const relationship in targetMember.relative_candidates) {
      if (!targetMember.relative_candidates.hasOwnProperty(relationship) || relationship === 'summary')
        continue;
      const targetCandidates = targetMember.relative_candidates[relationship];
      for (const candidateMemberId in targetCandidates) {
        if (!targetCandidates.hasOwnProperty(candidateMemberId))
          continue;
        const relativeMember = data.members[candidateMemberId];
        const relative = targetCandidates[candidateMemberId];
        const reverseRelationship =
          relationship === 'father' || relationship === 'mother' ? 'children' :
            relationship === 'children' ? (targetMember.gender === 'female' ? 'mother' : 'father') :
              relationship;
        const allReverseCandidates = relativeMember.relative_candidates || (relativeMember.relative_candidates = {
          summary: {
            total_guess_count: 0,
            strong_guess_count: 0,
            strong_guesses: {}
          }
        });
        const reverseCandidates = allReverseCandidates[reverseRelationship] || (allReverseCandidates[reverseRelationship] = {});
        if (!reverseCandidates[targetMemberId]) {
          const relativeData = {
            strong_evidence: relative.strong_evidence ? (reverseStrongEvidence[relative.strong_evidence] || relative.strong_evidence) : undefined,
            age_difference: ageDifference(relativeMember.birthdate, targetMember.birthdate),
            name: targetMember.name,
            distance: relative.distance,
            district: targetMember.district,
            from_second_attempt: true
          };
          copyVenue(relativeData, targetMember);
          reverseCandidates[targetMemberId] = relativeData;
          allReverseCandidates.summary.total_guess_count++;
          if (relativeData.strong_evidence) {
            allReverseCandidates.summary.strong_guess_count++;
            allReverseCandidates.summary.strong_guesses[relativeData.strong_evidence] = (allReverseCandidates.summary.strong_guesses[relativeData.strong_evidence] || 0) + 1;

            const summaryKey = evidenceToSummaryKey(relativeData.strong_evidence);
            if (summaryKey) {
              const sum = allReverseCandidates.summary[summaryKey] || (allReverseCandidates.summary[summaryKey] = {
                count: 0,
                ids: null
              });
              sum.count++;
              addOrSet(sum, 'ids', targetMemberId);
            }
          }
        }
      }
    }
  }

  // sort all relative candidates
  const maleOrder = ['spouse', 'children', 'father', 'siblings', 'mother'];
  const femaleOrder = ['spouse', 'father', 'siblings', 'children', 'mother'];
  for (const targetMemberId in data.members) {
    if (!data.members.hasOwnProperty(targetMemberId))
      continue;
    const targetMember = data.members[targetMemberId];
    if (!targetMember.relative_candidates) {
      continue;
    }
    targetMember.relative_candidates = sortKeys(targetMember.relative_candidates, null, (a, b) => {
      const aMain = a === 'summary';
      const bMain = b === 'summary';
      if (aMain != bMain) {
        return aMain ? -1 : 1;
      }
      const aCount = countKeys(targetMember.relative_candidates[a]);
      const bCount = countKeys(targetMember.relative_candidates[b]);
      if (aCount !== bCount) {
        return aCount < bCount ? -1 : 1;
      }
      const order = targetMember.gender === 'female' ? maleOrder : femaleOrder;
      const aIndex = order.indexOf(a);
      const bIndex = order.indexOf(b);
      if (aIndex === -1 || bIndex === -1)
        throw Error(a + ' ' + b);
      if (aIndex !== bIndex) {
        return aIndex < bIndex ? -1 : 1;
      }
      return a !== b ? a < b ? -1 : 1 : 0;
    });

    bumpRelativeStats(totalStats, targetMember, targetMember.relative_candidates, true);
    const commissions = allCommissionsOf(data, targetMember);
    commissions.forEach((commission) => {
      const localStats = commission.stats.members || (commission.stats.members = {
        relative_guesses: {
          total_count: 0,
          members_with_guesses: 0,
          strong_count: {},
          commissions: {
            total_count: 0
          }
        }
      });
      bumpRelativeStats(localStats, targetMember, targetMember.relative_candidates);
    });
  }

  if (totalStats.relative_guesses.commissions.total_count) {
    totalStats.relative_guesses.commissions = sortKeysByValueDesc(totalStats.relative_guesses.commissions);
  }

  return totalStats;
}

function getTotalPapersCount (metadata) {
  return metadata.papers.valid_count + metadata.papers.invalid_count + metadata.papers.lost_count;
}

function assignPlaces (protocol, winnerCount) {
  if (empty(protocol.entries)) {
    protocol.official_result = {};
    protocol.empty = true;
    return;
  }
  const entriesByPlace = cloneArray(protocol.entries).sort((a, b) => b.official_result.votes_count - a.official_result.votes_count);
  let currentPlace = 0;
  let lastVotesCount = -1;
  let placeCount = 0;
  for (let entryIndex = 0; entryIndex < entriesByPlace.length; entryIndex++) {
    const entry = entriesByPlace[entryIndex];
    if (lastVotesCount != entry.official_result.votes_count) {
      if (placeCount > 1) {
        for (let reverseEntryIndex = entryIndex - 1; reverseEntryIndex >= entryIndex - placeCount; reverseEntryIndex--) {
          const reversePlace = entriesByPlace[reverseEntryIndex];
          reversePlace.official_result.place = reversePlace.official_result.place + (1 / placeCount);
        }
      }
      lastVotesCount = entry.official_result.votes_count;
      currentPlace++;
      placeCount = 1;
    } else {
      placeCount++;
    }
    entry.official_result.place = currentPlace;
  }
  let winningVotesCount = 0;
  let losingVotesCount = 0;
  const votesCountByPlace = {};
  let minWinningCount = null;
  entriesByPlace.forEach((entry) => {
    entry.official_result.winner = Math.floor(entry.official_result.place) <= winnerCount;
    if (entry.official_result.place % 1.0 != 0) {
      entry.official_result.same_place_candidate_count = 1.0 / (entry.official_result.place % 1.0);
    }
    const key = '#' + entry.official_result.place;
    if (!votesCountByPlace[key]) {
      votesCountByPlace[key] = {count: 0, percentage: null};
      if (entry.supported_by_smart_vote) {
        votesCountByPlace[key].supported_by_smart_vote = true;
      }
    }
    votesCountByPlace[key].count += entry.official_result.votes_count;
    if (entry.official_result.winner) {
      winningVotesCount += entry.official_result.votes_count;
      if (minWinningCount === null || minWinningCount > entry.official_result.votes_count) {
        minWinningCount = entry.official_result.votes_count;
      }
    } else {
      losingVotesCount += entry.official_result.votes_count;
      entry.official_result.lacking_votes_count = null;
    }
  });
  entriesByPlace.forEach((entry) => {
    if (!entry.official_result.winner) {
      entry.official_result.lacking_votes_count = minWinningCount - entry.official_result.votes_count;
    }
  });
  let otherVotesCount = protocol.metadata.papers.invalid_count + protocol.metadata.papers.lost_count;
  const totalVotesCount = winningVotesCount + losingVotesCount + otherVotesCount;

  if (winnerCount == 1) {
    if (totalVotesCount != getTotalPapersCount(protocol.metadata)) {
      console.log(toJson(protocol));
      throw Error('Total votes count does not match: ' + totalVotesCount + ' (' + [winningVotesCount, losingVotesCount, otherVotesCount].join(', ') +  ') != ' + getTotalPapersCount(protocol.metadata));
    }
  } else if (winnerCount > 1) {
    const maxVotesCount = protocol.metadata.papers.valid_count * winnerCount + otherVotesCount;
    if (totalVotesCount > maxVotesCount) {
      console.log(toJson(protocol));
      throw Error('Maximum votes count exceeded! ' + totalVotesCount + ' > ' + maxVotesCount);
    }
  }

  protocol.official_result.votes_stats = {
    winning_count: winningVotesCount,
    winning_percentage: winningVotesCount / totalVotesCount * 100,
    effective_count: null,
    losing_count: losingVotesCount,
    losing_percentage: losingVotesCount / totalVotesCount * 100,
    other_count: otherVotesCount,
    other_percentage: otherVotesCount / totalVotesCount * 100,
    by_place: sortKeys(votesCountByPlace, (value) => {
      value.percentage = value.count / totalVotesCount * 100;
      return value;
    }, (a, b) => {
      return votesCountByPlace[b].count - votesCountByPlace[a].count;
    })
  };

  let effectiveVotesCount = 0;

  entriesByPlace.forEach((entry) => {
    effectiveVotesCount += entry.official_result.votes_count;
    entry.official_result.percentage = totalVotesCount === 0 ? 0 : entry.official_result.votes_count / totalVotesCount * 100;
    entry.official_result.valid_percentage = (winningVotesCount + losingVotesCount) > 0 ?
      entry.official_result.votes_count / (winningVotesCount + losingVotesCount) * 100 :
      0;
    entry.official_result.registered_percentage = protocol.metadata.voters.registered_count > 0 ?
      entry.official_result.votes_count / protocol.metadata.voters.registered_count * 100 :
      0;
    if (entry.official_result.winner) {
      const position = protocol.entries.indexOf(entry) + 1;
      if (position == 0)
        throw Error();
      if (entry.party_id || entry.candidate_id) {
        addOrSet(protocol.official_result.winner, 'id', entry.party_id || entry.candidate_id, true);
        addOrSet(protocol.official_result.winner, 'supported_by_smart_vote', entry.supported_by_smart_vote);
      } else {
        // don't forget to set by yourself
      }
      addOrSet(protocol.official_result.winner, 'position', position, true);
      addOrSet(protocol.official_result.winner, 'percentage', entry.official_result.percentage, true);
      addOrSet(protocol.official_result.winner, 'valid_percentage', entry.official_result.valid_percentage, true);
      addOrSet(protocol.official_result.winner, 'registered_percentage', entry.official_result.registered_percentage, true);
    }
    if (winnerCount === 1) {
      const withoutPercentage = {};
      entriesByPlace.forEach((otherEntry) => {
        if (otherEntry !== entry) {
          const otherId = otherEntry.party_id || otherEntry.candidate_id;
          const votesCount = totalVotesCount - otherEntry.official_result.votes_count;
          const validVotesCount = (winningVotesCount + losingVotesCount) - otherEntry.official_result.votes_count;
          withoutPercentage[otherId] = {
            percentage: entry.official_result.votes_count / votesCount * 100.0,
            valid_percentage: entry.official_result.votes_count / validVotesCount * 100.0
          };
        }
      });
      entry.result_without_other_entry = withoutPercentage;
    }
  });

  protocol.official_result.votes_stats.effective_count = effectiveVotesCount;

  if (effectiveVotesCount === 0) {
    protocol.empty = true;
  }
}

function parseResult (rawResult, ballotDataId, electoralDistrict, processCandidate, allCandidates, allParties, smartCandidates, venue, staticMetadata) {
  if (!rawResult.report)
    throw Error('Invalid result, report is missing: ' + JSON.stringify(rawResult));
  const result = {
    commission_name: 'УИК №' + venue.id,
    ballot_name: rawResult.report.vibory,
    name: rawResult.report.nazv,
    protocol_scope: {
      type: 'uik',
      id: venue.id
    },
    electoral_district: {
      type: electoralDistrict.type,
      municipality: electoralDistrict.municipality,
      id: (typeof electoralDistrict.id === 'string' ? parseInt(electoralDistrict.id.match(/\d+$/)[0]) : electoralDistrict.id)
    },
    data_id: parseInt(rawResult.report.vrnvibref),
    ballot_data_id: ballotDataId,
    has_koib: venue.has_koib,
    generated_date: parseDate(rawResult.report.generation_time),
    official_result: {
      winner: {
        id: null, // candidate_id or party_id
        position: null,
        percentage: null,
        valid_percentage: null,
        registered_percentage: null,
      },
      turnout: {
        count: 0,
        percentage: null,
        walk_by_count: 0,
        walk_by_percentage: null,
        on_home_count: 0,
        on_home_percentage: null,
        ahead_of_time_count: 0,
        ahead_of_time_percentage: null,
        valid_count: 0,
        valid_percentage: null,
        invalid_count: 0,
        invalid_percentage: null,
        taken_home_count: 0,
        taken_home_percentage: null,
        lost_count: 0,
        lost_percentage: null
      }
    },
    turnout_protocols: { },
    metadata: { analysis: { } }
  };

  if (empty(rawResult.report.line)) {
    result.official_result = {};
    result.empty = true;
    addVenue(result, venue);
    return result;
  }

  if (staticMetadata) {
    for (const key in staticMetadata) {
      const obj = staticMetadata[key];
      for (const valueKey in obj) {
        const targetObj = result.metadata[key] || (result.metadata[key] = {});
        targetObj[valueKey] = obj[valueKey];
      }
    }
  }

  const metadataMap = {
    'Число избирательных бюллетеней, полученных участковой избирательной комиссией':
      ['papers', 'received_count'],
    'Число погашенных избирательных бюллетеней':
      ['papers', 'destroyed_count'],
    'Число избирательных бюллетеней, содержащихся в стационарных ящиках для голосования':
      ['papers', 'stationary_box_count'],
    'Число избирательных бюллетеней, содержащихся в переносных ящиках для голосования':
      ['papers', 'portable_box_count'],
    'Число действительных избирательных бюллетеней':
      ['papers', 'valid_count'],
    'Число недействительных избирательных бюллетеней':
      ['papers', 'invalid_count'],
    'Число утраченных избирательных бюллетеней':
      ['papers', 'lost_count'],
    'Число избирательных бюллетеней, не учтенных при получении':
      ['papers', 'ignored_count'],

    'Число избирателей, внесенных в список избирателей на момент окончания голосования':
      ['voters', 'registered_count'],
    'Число избирательных бюллетеней, выданных избирателям в помещении для голосования в день голосования':
      ['voters', 'walk_by_count'],
    'Число избирательных бюллетеней, выданных в помещении для голосования в день голосования':
      ['voters', 'walk_by_count'],
    'Число избирательных бюллетеней, выданных избирателям, проголосовавшим вне помещения для голосования':
      ['voters', 'on_home_count'],
    'Число избирательных бюллетеней, выданных вне помещения для голосования в день голосования':
      ['voters', 'on_home_count'],
    'Число избирательных бюллетеней, выданных избирателям, проголосовавшим досрочно':
      ['voters', 'ahead_of_time_count'],
    'Число избирателей, проголосовавших по открепительным удостоверениям на избирательном участке':
      ['voters', 'exceptional_count'],

    'Число открепительных удостоверений, полученных участковой избирательной комиссией':
      ['exceptions', 'received_count'],
    'Число открепительных удостоверений, выданных участковой избирательной комиссией избирателям':
      ['exceptions', 'provided_count'],
    'Число открепительных удостоверений, выданных УИК избирателям на избирательном участке до дня голосования':
      ['exceptions', 'provided_ahead_of_time_count'],
    'Число открепительных удостоверений, выданных территориальной комиссией избирателям':
      ['exceptions', 'provided_by_tik_count'],
    'Число открепительных удостоверений, выданных избирательной комиссией муниципального образования избирателям':
      ['exceptions', 'provided_by_municipality_count'],
    'Число погашенных на избирательном участке открепительных удостоверений':
      ['exceptions', 'destroyed_count'],
    'Число утраченных открепительных удостоверений':
      ['exceptions', 'lost_count']
  };

  Object.values(metadataMap).forEach((keys) => {
    if (keys[0] != 'exceptions') {
      if (!result.metadata[keys[0]])
        result.metadata[keys[0]] = {};
      result.metadata[keys[0]][keys[1]] = 0;
    }
  });

  let isMetadata = true;
  let delimiterCount = 0;
  let votesCount = 0;
  for (let lineIndex = 0; lineIndex < rawResult.report.line.length; lineIndex++) {
    const line = rawResult.report.line[lineIndex];
    if (line.delimetr) {
      delimiterCount++;
      if (isMetadata) {
        if (result.metadata) {
          result.metadata.papers.taken_home_count = result.official_result.turnout['taken_home_count'] = (
            result.metadata.voters.on_home_count +
            result.metadata.voters.walk_by_count +
            result.metadata.voters.ahead_of_time_count
          ) - (
            result.metadata.papers.stationary_box_count +
            result.metadata.papers.portable_box_count
          );
        }

        isMetadata = false;
      }
      continue;
    }
    if (delimiterCount > 1) {
      throw Error('Duplicate delimiter: ' + toJson(rawResult));
    }
    const index = parseInt(line.index);
    const value = parseInt(line.kolza || line.kol);
    if (value < 0 || value === null)
      throw Error('Invalid value: ' + (line.kolza || line.kol) + '\n' + toJson(rawResult));
    const percentage = line.perza ? parseFloat(line.perza) : undefined;
    const entryIndex = line.numsved ? parseInt(line.numsved) : undefined;
    if (isMetadata) {
      if (!result.metadata) {
        result.metadata = { };
      }
      const metadataKey = metadataMap[line.txt];
      if (!metadataKey) {
        throw Error('Unknown metadata: ' + line.txt + '\n' + toJson(rawResult));
      }
      if (value != 0 || metadataKey[0] != 'exceptions') {
        if (!result.metadata[metadataKey[0]]) {
          result.metadata[metadataKey[0]][metadataKey[1]] = value;
        }
        result.metadata[metadataKey[0]][metadataKey[1]] = value;
        if (metadataKey[0] === 'voters') {
          switch (metadataKey[1]) {
            case 'walk_by_count':
            case 'on_home_count':
            case 'ahead_of_time_count':
              result.official_result.turnout.count += value;
              result.official_result.turnout[metadataKey[1]] += value;
              break;
            case 'registered_count':
              if (result.metadata.voters.initially_registered_count) {
                const diff = result.metadata.voters.registered_count - result.metadata.voters.initially_registered_count;
                if (diff > 0) {
                  result.metadata.voters.added_count = diff;
                } else if (diff < 0) {
                  result.metadata.voters.removed_count = -diff;
                }
              }
              break;
          }
        } else if (metadataKey[0] === 'papers') {
          switch (metadataKey[1]) {
            case 'valid_count':
            case 'invalid_count':
            case 'lost_count':
            case 'taken_home_count':
              result.official_result.turnout[metadataKey[1]] += value;
              break;
          }
        }
      }
    } else {
      if (!result.official_result.votes_stats) {
        result.official_result.votes_stats = {};
      }
      if (!result.entries) {
        result.entries = [];
      }
      if (entryIndex - 1 != result.entries.length)
        throw Error('Inconsistent data: ' + toJson(rawResult));
      if (!line.txt)
        throw Error('Missing txt: ' + toJson(rawResult));
      const res = {
        name: line.txt.replace(RegExp('^' + entryIndex + '\\. ', 'gi'), ''),
        position: entryIndex
      };
      if (electoralDistrict.id) {
        res.candidate_id = 0;
        if (line.namio) {
          const partyKey = cleanPartyName(line.namio).toLowerCase();
          if (partyKey == 'самовыдвижение') {
            res.supported_by_people = true;
          } else {
            const partyId = allParties.keyToId[partyKey];
            if (partyId) {
              res.supported_by_party_id = partyId;
            } else if (['социальной защиты'].includes(partyKey)) {
              res.supported_by_party_name = line.namio;
            } else {
              throw Error(toJson(partyKey) + ' ' + toJson(line.namio) + '\n\n' + toJson(allParties.keyToId));
            }
          }
        } else {
          const candidateId = allCandidates.keyToId[res.name.toLowerCase()];
          if (!candidateId) {
            throw Error();
          }
          res.candidate_id = candidateId;
          const candidateInfo = allCandidates.entries[candidateId].electoral_districts[electoralDistrict.type];
          if (candidateInfo.id !== electoralDistrict.id)
            throw Error();
          ['supported_by_people', 'supported_by_party_id', 'supported_by_party_name'].forEach((key) => {
            if (candidateInfo[key]) {
              res[key] = candidateInfo[key];
            }
          });
        }
        if (smartCandidates[electoralDistrict.type] && smartCandidates[electoralDistrict.type]['person_' + electoralDistrict.id] === res.name) {
          res.supported_by_smart_vote = true;
        }
      } else {
        res.party_id = 0;
      }
      votesCount += value;
      res.official_result = {
        votes_count: value,
        place: null,
        percentage: null,
        valid_percentage: null,
        registered_percentage: null,
        display_percentage: percentage,
      };
      if (result.entries.length + 1 != entryIndex)
        throw Error();
      result.entries.push(res);
    }
  }

  if (result.metadata.voters && result.metadata.voters.registered_count) {
    result.official_result.turnout.percentage = result.official_result.turnout.count / result.metadata.voters.registered_count * 100;
    ['valid', 'invalid', 'lost', 'on_home', 'ahead_of_time', 'walk_by', 'taken_home'].forEach((key) => {
      result.official_result.turnout[key + '_percentage'] = result.official_result.turnout[key + '_count'] / result.metadata.voters.registered_count * 100;
    });
  } else {
    ['valid', 'invalid', 'lost', 'on_home', 'ahead_of_time', 'walk_by', 'taken_home'].forEach((key) => {
      result.official_result.turnout[key + '_percentage'] = 0;
    })
  }

  result.entries.forEach((entry) => {
    if (electoralDistrict.id) {
      entry.candidate_id = processCandidate(entry.name, electoralDistrict, entry, venue);
    } else {
      entry.party_id = processCandidate(entry.name, electoralDistrict, entry, venue);
    }
  });

  assignPlaces(result, getWinnerCount(electoralDistrict.type));

  result.entries.forEach((entry) => {
    if (entry.official_result.winner) {
      addOrSet(result.official_result.winner, 'id', entry.party_id || entry.candidate_id);
      addOrSet(result.official_result.winner, 'supported_by_smart_vote', entry.supported_by_smart_vote);
    }
  });
  result.entries.sort((a, b) => a.official_result.place - b.official_result.place);

  addVenue(result, venue);

  return result;
}

function cleanPartyName (name) {
  let cleanName = name.replace(/^(политическая |всероссийская )*/gi, '');
  cleanName = name.replace(/^(санкт-петербургское |местное |региональное |отделение |социалистической |всероссийской |политической |партии |российская )*/gi, '');
  try {
    if (cleanName.endsWith('"')) {
      cleanName = cleanName.match(/(?<=")[^"]+(?="$)/gi)[0];
    }
    if (cleanName.endsWith('»') && cleanName.includes('«')) {
      cleanName = cleanName.match(/(?<=«)[^»]+/gi)[0];
    }
    if (cleanName.toLowerCase().startsWith('партия ') && cleanName.indexOf(' ', 'партия '.length) >= 0) {
      cleanName = cleanName.substring('партия '.length);
    }
    if (cleanName.toLowerCase().startsWith('российская ')) {
      cleanName = cleanName.substring('российская '.length);
    }
    let splitIndex = cleanName.indexOf(' – ');
    if (splitIndex == -1) {
      splitIndex = cleanName.indexOf(' - ');
    }
    if (splitIndex >= 0) {
      cleanName = cleanName.substring(0, splitIndex);
    }
    cleanName = cleanName.replace(/^"/gi, '').replace(/"$/gi, '');
    cleanName = cleanName.replace(/^политическая партия /gi, '');
    cleanName = cleanName.replace(/ за социальную справедливость$/gi, '');
    cleanName = cleanName.replace(/".+$/gi, '');
    cleanName = cleanName.replace(/ в (?:городе |г\. ?)санкт-петербурге$/gi, '');
    cleanName = cleanName.replace(/^Коммунистическая партия (?=коммунисты)/gi, '');
    cleanName = cleanName.replace(/^Российская /gi, '');
    cleanName = ucwords(cleanName);
  } catch (e) {
    console.log('Cannot clean', toJson(cleanName), toJson(name));
    throw e;
  }
  return cleanName;
}

function extractMunicipalityName (name) {
  return ucwords(name.match(/(?<=муниципальный округ )[а-я]+/gi)[0]);
}

function cloneWithoutResult (candidate) {
  const cloned = clone(candidate);
  if (!cloned || !cloned.official_result)
    throw Error(toJson(cloned));
  [
    'place',
    'percentage',
    'display_percentage',
    'valid_percentage',
    'registered_percentage',
    'winner'
  ].forEach((key) => {
    cloned.official_result[key] = null;
  });
  [
    'display_percentage',
    'without_other_entry',
    'same_place_candidate_count',
    'lacking_votes_count'
  ].forEach((key) => {
    delete cloned.official_result[key];
  });
  return cloned;
}

function getWinnerCount (electoralDistrictType) {
  return electoralDistrictType === 'municipality' ? 5 : 1;
}

// HTML

async function buildHtmlReport (data) {
  // TODO
}

// BOT

function secureFileName (name) {
  return name.replace(/[:\/]/gi, '_');
}

function htmlEncode (text) {
  return text.replace(/</gi, '&lt;').replace(/>/gi, '&gt;');
}

function findTextCommand (text, entities) {
  if (typeof text === 'string' && Array.isArray(entities) && entities.length > 0) {
    for (let entityIndex = 0; entityIndex < entities.length; entityIndex++) {
      const entity = entities[entityIndex];
      if (entity.type === 'bot_command' && entity.offset == 0) {
        const command = entity.length < text.length ? text.substring(0, entity.length) : text;
        const args = command.length < text.length ? text.substring(command.length).trim() : '';
        return {
          command: command.toLowerCase(),
          args: args
        };
      }
    }
  }
  return null;
}

function countRepetitions (text, substring, startIndex) {
  startIndex = startIndex || 0;
  let count = 0;
  for (let i = startIndex; i < text.length; i += substring.length) {
    if (text.substring(i, i + substring.length) === substring) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function toDisplayPercentage (percentage, noLong) {
  if (percentage === 0)
    return '0.00';
  if (Math.floor(percentage) === percentage)
    return Math.floor(percentage).toString();
  let text = percentage.toString();
  let index = text.indexOf('.');
  if (index !== -1) {
    // Find repetitions
    const decimal = text.substring(index + 1, Math.min(index + 3, text.length));
    if (decimal.length <= 1)
      return text;
    if (!noLong) {
      if (countRepetitions(text, decimal, index + 1) > 1 || // 5.45457
        countRepetitions(text, decimal.substring(0, 1), index + 1) > 2) { // 5.4447
        return text;
      }
    }
  }

  let size = 2;
  let result;
  do {
    result = percentage.toFixed(size);
    size++;
  } while (result.match(/^0\.0+$/gi));
  return result;
}

function editMessageMedia (bot, media, form) {
  const buffer = media.media;
  const opts = {
    qs: form,
  };

  opts.formData = {};

  const payload = Object.assign({}, media);
  delete payload.media;

  try {
    const attachName = String(0);
    const [formData] = bot._formatSendData(
      attachName,
      buffer,
      media.fileOptions
    );

    if (formData) {
      opts.formData[attachName] = formData[attachName];
      payload.media = `attach://${attachName}`;
    } else {
      throw new errors.FatalError(`Failed to process the replacement action for your ${media.type}`);
    }
  } catch (ex) {
    return Promise.reject(ex);
  }

  opts.qs.media = JSON.stringify(payload);

  return bot._request('editMessageMedia', opts);
}

async function sendMessage (bot, chatId, text, options) {
  const limit = 4000;
  if (text.replace(/<\/?[a-z]+>/gi, '').replace(/<a href="[^"]+">/gi, '').length <= limit) {
    return [await bot.sendMessage(chatId, text, options)];
  }
  const parts = [];
  while (text.length) {
    let partLength = Math.min(text.length, limit);
    let splitter = null;
    if (text.length - partLength) {
      const splitters = ['\n\n', '\n', ' ', '.', ',', '_', ':'];
      for (let i = 0; i < splitters.length; i++) {
        const index = text.lastIndexOf(splitters[i], partLength);
        if (index !== -1) {
          partLength = index;
          splitter = splitters[i];
          break;
        }
      }
    }
    const part = text.substring(0, partLength).trim();
    if (part) {
      parts.push(part);
    }
    text = text.substring(partLength + (splitter ? splitter.length : 0));
  }
  const result = [];
  const optionsWithoutReplyMarkup = clone(options, 'reply_markup')
  for (let i = 0; i < parts.length; i++) {
    let usedOptions;
    if (i + 1 === parts.length) {
      usedOptions = options;
    } else {
      usedOptions = optionsWithoutReplyMarkup;
    }
    result.push(await bot.sendMessage(chatId, parts[i], usedOptions));
  }
  return result;
}

function convertToCommand (text, entities, electionData) {
  if (typeof text !== 'string')
    return null;

  let match;

  match = text.match(/^[0-9]+$/);
  if (match) {
    const id = parseInt(match[0]);
    if (!id) {
      return null;
    }
    return {
      command: '/select',
      id
    };
  }

  // TODO tik
  // TODO locale
  match = text.match(/(уик|тик|оик|tik|uik|oik|участков[а-я]*|территориальн[а-я]*|окружн[а-я]*|local|territorial|district)\s*(?:избирательн[а-я]* |комисси[а-я]* |election |commission )*[\s#№]*(\d+)/i);
  if (match) {
    if (match.length != 3)
      return null;
    const commissionId = parseInt(match[2]);
    if (!commissionId)
      return null;
    let commissionType = null;

    const type = match[1].toLowerCase();
    if (type === 'уик' || type.startsWith('участков') || type === 'uik' || type === 'local') {
      commissionType = 'uik';
    } else if (type === 'тик' || type.startsWith('территориальн') || type === 'tik' || type === 'territorial' || type === 'district') {
      commissionType = 'tik';
    }/* else if (type === 'оик' || type.startsWith('окружн') || type === 'oik') {
      commissionType = 'oik';
    }*/ else {
      return null;
    }

    return {
      command: '/commission',
      args: commissionType + (commissionId ? '_' + commissionId : '')
    };
  }

  match = text.match(/комисс[а-я]+\s+[#№]*(\d+)/i) || text.match(/[#№]?(\d+)\s+комисс[а-я]+/i);
  if (match) {
    if (match.length != 2)
      return null;
    const commission_id = parseInt(match[1]);
    if (!commission_id)
      return null;
    return {
      command: '/select',
      commission_id
    };
  }

  match = text.match(new RegExp(electionData.gik.id + '|гик|горизбирком', 'i'));
  if (match) {
    return {
      command: '/commission',
      args: 'gik_' + electionData.gik.id
    };
  }

  match = text.match(/^Васильевский (?:остров|о-в)$/gi);
  if (match) {
    return {
      command: '/d',
      args: 'Василеостровский'
    };
  }

  match = text.match(/^([А-Яа-я]+)\s+(?:район|р-н)$/i);
  if (match) {
    const districtName = ucfirst(match[1].toLowerCase());
    const district = districtName + ' район';
    if (electionData.gik.districts.includes(district)) {
      return {
        command: '/d',
        args: districtName
      };
    }
  }

  match = text.match(/^[А-Яа-я]+$/gi);
  if (match) {
    const shortcuts = {
      'Васильевский': 'Василеостровский',
      'Васька': 'Василеостровский',
      'Петрога': 'Петроградский',
      'Центр': 'Центральный',
      'Кронштадт': 'Кронштадский',
      'Колпино': 'Колпинский'
    };
    let singleWord = ucfirst(text.toLowerCase());
    singleWord = shortcuts[singleWord] || singleWord;
    const district = singleWord + ' район';
    if (electionData.gik.districts.includes(district)) {
      return {
        command: '/d',
        args: singleWord
      };
    }
  }

  return null;
}

function normalizeLanguageCode (languageCode) {
  if (i18n.getLocales().includes(languageCode)) {
    return languageCode;
  }
  return i18n.defaultLocale;
}

const ADMIN_CHAT_ID = -1001771451349;

function isWellKnownPartyAbbreviation (abbr) {
  return abbr && ['КПРФ'].includes(abbr);
}

function getEntryName (context, electionData, entry) {
  let name;
  if (entry.party_id) {
    const party = electionData.parties[entry.party_id];
    name = isWellKnownPartyAbbreviation(party.name.abbreviation) ? party.name.abbreviation : party.name.full;
    if (context.isLatinLocale) {
      name = context.__('party_name.' + name);
    }
  } else {
    const candidate = electionData.candidates[entry.candidate_id];
    name = candidate.name.first + ' ' + candidate.name.last;
    if (context.isLatinLocale) {
      name = cyrillicToLatin(name);
    }
  }
  return name;
}

function getPartyPrefix (context, electionData, member, isShort) {
  if (isShort && member.awards) {
    if (member.awards.length === 1) {
      return context.__('emoji.award.' + member.awards[0]);
    } else {
      return context.__('emoji.award.any');
    }
  }
  const key = getPartyPrefixKey(electionData, member, isShort);
  return key ? context.__('emoji.party_prefix.' + key) : null;
}

function getPartyPrefixKey (electionData, member, isShort) {
  if (member.assigned_by_id) {
    const assignedBy = electionData.assignedBy[member.assigned_by_id];
    const name = assignedBy.party_abbreviation === 'КПРФ' ? assignedBy.party_abbreviation : (assignedBy.party_name || assignedBy.name);
    if (name) {
      if (name.match(/^Единая Россия$/gi)) {
        return 'united_russia';
      }
      if (name.match(/^Яблоко$/gi)) {
        return 'apple';
      }
      if (name.match(/^Партия Роста$/gi)) {
        return 'growth';
      }
      if (name.match(/^Собрание избирателей по месту работы$/gi)) {
        return 'workers_gathering';
      }
      if (name.match(/^Собрание избирателей по месту жительства$/gi)) {
        return 'residents_gathering';
      }
      if (name.match(/^Автоклуб$/gi)) {
        return 'auto_club';
      }
      if (name.match(/^Зел[её]ные$/gi)) {
        return 'green';
      }
      if (name.match(/^КПРФ$/gi)) {
        return 'communist';
      }
    }
  }
  return null;
}

function groupMembers (electionData, memberIds) {
  const members = {}; // role -> assigned_by -> member
  if (empty(memberIds)) {
    return members;
  }
  if (memberIds.chairman_id) {
    members.chairman = electionData.members[memberIds.chairman_id];
  }
  if (memberIds.vice_chairman_id) {
    members.vice_chairman = electionData.members[memberIds.vice_chairman_id];
  }
  if (memberIds.secretary_id) {
    members.secretary = electionData.members[memberIds.secretary_id];
  }
  const otherMembers = [];
  if (Array.isArray(memberIds.other_ids)) {
    memberIds.other_ids.forEach((memberId) => {
      const member = electionData.members[memberId];
      otherMembers.push(member);
    });
  } else if (memberIds.other_ids) {
    const member = electionData.members[memberIds.other_ids];
    otherMembers.push(member);
  }
  if (otherMembers.length) {
    otherMembers.sort((a, b) => {
      const u1 = Array.isArray(a.related_to.venue) ? a.related_to.venue.length : 1;
      const u2 = Array.isArray(b.related_to.venue) ? b.related_to.venue.length : 1;
      if (u1 != u2) {
        return u1 < u2 ? 1 : -1;
      }

      /*const aCritical = a.relative_candidates && hasStrongGuess(a.relative_candidates.summary.strong_guesses);
      const bCritical = b.relative_candidates && hasStrongGuess(b.relative_candidates.summary.strong_guesses);
      if (aCritical !== bCritical) {
        return aCritical ? -1 : 1;
      }

      let aStrongScore = 0;
      let bStrongScore = 0;
      if (a.relative_candidates) {
        Object.keys(a.relative_candidates.summary.strong_guesses).forEach((key) => {
          aStrongScore += getEvidenceScore(key) * a.relative_candidates.summary.strong_guesses[key];
        });
      }
      if (b.relative_candidates) {
        Object.keys(b.relative_candidates.summary.strong_guesses).forEach((key) => {
          bStrongScore += getEvidenceScore(key) * b.relative_candidates.summary.strong_guesses[key]
        });
      }
      if (aStrongScore != bStrongScore) {
        return aStrongScore < bStrongScore ? 1 : -1;
      }*/

      const aRelativeCount = a.relative_candidates ? a.relative_candidates.summary.total_guess_count : 0;
      const bRelativeCount = b.relative_candidates ? b.relative_candidates.summary.total_guess_count : 0;
      if (!!aRelativeCount != !!bRelativeCount) {
        return !!aRelativeCount ? -1 : 1;
      }
      if (aRelativeCount != bRelativeCount) {
        return aRelativeCount < bRelativeCount ? -1 : 1;
      }
      const aHasStrong = a.relative_candidates && hasStrongGuess(a.relative_candidates.summary.strong_guesses);
      const bHasStrong = b.relative_candidates && hasStrongGuess(b.relative_candidates.summary.strong_guesses);
      if (aHasStrong != bHasStrong) {
        return aHasStrong ? -1 : 1;
      }
      const aStrongCount = a.relative_candidates ? a.relative_candidates.summary.strong_guess_count : 0;
      const bStrongCount = b.relative_candidates ? b.relative_candidates.summary.strong_guess_count : 0;
      if (aStrongCount != bStrongCount) {
        return aStrongCount < bStrongCount ? 1 : -1;
      }
      if (a.name.last != b.name.last) {
        return a.name.last < b.name.last ? -1 : 1;
      }
      if (a.name.first != b.name.first) {
        return a.name.first < b.name.first ? -1 : 1;
      }
      if (a.age && b.age && a.age != b.age) {
        return a.age < b.age ? 1 : -1;
      }
      return 0;
    });
    members.other = otherMembers;
  }
  return members;
}

function hasStrongGuess (guesses) {
  return guesses.same_commission || guesses.same_building || guesses.works_in_child_commission || guesses.works_in_parent_commission; // || guesses.works_in_child_district_commission || guesses.works_in_parent_district_commission;
}

function buildMembersReport (context, electionData, commission, isFull) {
  const membersInfo = commission.members;
  if (empty(membersInfo)) {
    return null;
  }
  const commissionLevel = commission.type;
  const commissionId = commission.id;
  let text = '';
  const buttons = [];
  const members = groupMembers(electionData, membersInfo, false);
  let haveStrongWarnings = false;
  let haveWeakFamilyWarnings = false;
  let haveCriticalWarnings = false;
  let membersWithRelatives = 0;
  let membersSiblingsCount = 0;
  const addMember = (roleKey, member, position) => {
    let haveStrongMemberWarnings = false;
    let haveWeakMemberWarnings = false;
    let haveCriticalMemberWarnings = false;

    if (text.length)
      text += isFull ? '\n\n' : '\n';
    let name = isFull ? fullName(member.name) : member.name.first + ' ' + member.name.last;
    if (context.isLatinLocale) {
      name = cyrillicToLatin(name);
    }
    const role = context.__('members.' + (roleKey == 'vice_chairman' && membersInfo.chairman ? 'vice' : roleKey));
    const partyPrefix = getPartyPrefix(context, electionData, member, !isFull);
    if (Array.isArray(member.related_to.venue)) {
      haveCriticalMemberWarnings = true;
    }
    if (member.relative_candidates && member.relative_candidates.summary.total_guess_count) {
      membersWithRelatives++;
      membersSiblingsCount += member.relative_candidates.summary.total_guess_count;
      if (hasStrongGuess(member.relative_candidates.summary.strong_guesses)) {
        haveStrongMemberWarnings = true;
      } else {
        haveWeakMemberWarnings = true;
      }
    }
    const prefix = haveCriticalMemberWarnings ? context.__('emoji.warning.critical') : haveStrongMemberWarnings ? context.__('emoji.warning.strong') : haveWeakMemberWarnings ? context.__('emoji.warning.search') : null;
    if (prefix) {
      text += prefix + ' ';
    }
    if (roleKey != 'other') {
      text += context.__('members.member', {role, name, name_prefix: !isFull && partyPrefix ? partyPrefix + ' ' : ''});
    } else {
      text += context.__('members.position', {position, name});
    }
    if (isFull) {
      if (member.awards) {
        text += '\n';
        text += member.awards.map((key) => {
          return context.__('emoji.award.' + key) + ' ' + context.__('award.' + key + '.description.' + member.gender, {url: context.__('award.' + key + '.url')});
        }).join('\n');
      }
      if (member.birthdate) {
        text += '\n';
        text += context.__('members.birthdate.' + (member.gender || 'male'), member.birthdate);
        text += ', ';
        text += context.__n('age', ageDifference(Date.now(), member.birthdate));
      }
      const assignedBy = member.assigned_by_id ? electionData.assignedBy[member.assigned_by_id] : null;
      let assigned_by = assignedBy ? (
        isWellKnownPartyAbbreviation(assignedBy.party_abbreviation) ? (context.isLatinLocale ? context.__('party_name.' + assignedBy.party_abbreviation) : assignedBy.party_abbreviation) :
          ((assignedBy.party_name && context.isLatinLocale ? context.__('party_name.' + assignedBy.party_name) : assignedBy.party_name) || assignedBy.name)
      ) : null;
      if (assigned_by) {
        text += '\n';
        text += context.__('members.assigned_by.' + (member.gender || 'male'), {assigned_by, prefix: isFull && partyPrefix ? partyPrefix + ' ' : ''});
      }
      if (Array.isArray(member.related_to.venue)) {
        const duplicates = member.related_to.venue.filter((a) => a.type !== commissionLevel || a.id !== commissionId).map((venue) => '<b>' + asVenue(context, venue) + '</b>').join(', ');
        text += '\n';
        text += context.__('emoji.warning.exclamation');
        text += ' ';
        text += context.__('members.duplicate', {duplicates});
      }
      if (member.relative_candidates && member.relative_candidates.summary.total_guess_count) {
        Object.keys(member.relative_candidates).filter((key) => key != 'summary').forEach((relationship) => {
          const relativeMembers = member.relative_candidates[relationship];
          const relativeMemberIds = Object.keys(relativeMembers);

          let femaleCount = 0;
          let maleCount = 0;
          relativeMemberIds.forEach((relativeMemberId) => {
            const relativeMemberFull = electionData.members[relativeMemberId];
            if (relativeMemberFull.gender === 'female') {
              femaleCount++;
            } else {
              maleCount++;
            }
          });
          const mixedCount = (femaleCount + maleCount);

          let relationshipSuffix = (relationship === 'father' || relationship === 'mother' ? 'parents' : relationship) + '.' + member.gender;
          const emojiSuffix = (mixedCount > 1 ? 'few' : 'one') + '.' + (femaleCount && maleCount ? 'mixed' : maleCount > 0 ? 'male' : 'female');
          const emoji = mixedCount > 1 ? context.__n('emoji.relatives.' + relationshipSuffix + '.' + emojiSuffix, mixedCount) : context.__('emoji.relatives.' + relationshipSuffix + '.' + emojiSuffix);
          relationshipSuffix += '.' + (mixedCount > 7 ? 'many' : mixedCount > 1 ? 'few' : 'one') + '.' + (femaleCount && maleCount ? 'mixed' : maleCount > 0 ? 'male' : 'female');

          text += '\n';
          text += (emoji ? emoji : context.__('emoji.relatives.family')) + ' ';
          text += context.__n('members.relatives.' + relationshipSuffix, relativeMemberIds.length) + ':';
          relativeMemberIds.sort((a, b) => {
            const aRelative = relativeMembers[a];
            const bRelative = relativeMembers[b];

            const aMember = electionData.members[a];
            const bMember = electionData.members[b];
            if (relationship === 'siblings') {
              const aDiff = Math.abs(member.age - aMember.age);
              const bDiff = Math.abs(member.age - bMember.age);
              if (aDiff != bDiff) {
                return aDiff < bDiff ? -1 : 1;
              }
            }
            const aEvidenceScore = getEvidenceScore(aRelative.strong_evidence);
            const bEvidenceScore = getEvidenceScore(bRelative.strong_evidence);
            if (aEvidenceScore != bEvidenceScore) {
              return aEvidenceScore < bEvidenceScore ? 1 : -1;
            }
            if (aMember.role_id != bMember.role_id) {
              return aMember.role_id < bMember.role_id ? -1 : 1;
            }
            if (aMember.age != bMember.age) {
              return aMember.age < bMember.age ? -1 : 1;
            }
            const aName = fullName(aMember.name);
            const bName = fullName(bMember.name);
            return aName < bName ? -1 : aName > bName ? 1 : 0;
          }).forEach((relativeMemberId) => {
            if (relativeMemberIds.length > 1) {
              text += '\n';
              text += '• ';
            } else {
              text += ' ';
            }

            const relativeMember = relativeMembers[relativeMemberId];
            const relativeMemberFull = electionData.members[relativeMemberId];
            const relativeRoleKey = getRoleKey(electionData.roles[relativeMemberFull.role_id]);
            const displayEvidence = relativeMember.strong_evidence && !['strong_role', 'works_in_ancestor_commission', 'works_in_descendant_commission'].includes(relativeMember.strong_evidence) ? relativeMember.strong_evidence : null;

            let relativeName = fullName(relativeMemberFull.name);
            if (context.isLatinLocale) {
              relativeName = cyrillicToLatin(relativeName);
            }

            if (displayEvidence) {
              text += '<b>';
            }
            text += relativeName;
            if (displayEvidence) {
              text += '</b>';
            }
            text += ' — ';
            if (displayEvidence !== 'same_commission') {
              text += context.__('members.short.' + relativeRoleKey, {
                venue: asVenue(context, relativeMemberFull.related_to.venue)
              });
            } else {
              text += context.__('members.short.same_commission.' + relativeRoleKey);
            }

            const facts = [];
            if (displayEvidence) {
              const check = {};
              check[displayEvidence] = 1;
              facts.push(context.__(displayEvidence === 'same_commission' || displayEvidence === 'same_building' ? 'emoji.warning.double_exclamation' : 'emoji.warning.exclamation') + ' ' + '<u>' + context.__('members.strong_evidence.' + displayEvidence) + '</u>');
            }
            if (relativeMemberFull.age) {
              facts.push(context.__n('age', relativeMemberFull.age));
            }
            if (relativeMember.distance) {
              if (relativeMember.distance >= 1000) {
                facts.push(context.__('km_short', {kilometers: (relativeMember.distance / 1000.0).toFixed(2)}));
              } else {
                facts.push(context.__n('m_short', relativeMember.distance));
              }
            }
            if (relativeMember.district && relativeMember.district !== commission.district) {
              facts.push(relativeMember.district.replace(/район/i, 'р-н'));
            }
            if (facts.length) {
              text += ', ' + facts.join(', ');
            }
          });
        });
      }
    } else {
      text += ', ';
      text += context.__n('age', ageDifference(Date.now(), member.birthdate));
    }

    haveCriticalWarnings = haveCriticalWarnings || haveCriticalMemberWarnings;
    haveStrongWarnings = haveStrongWarnings || haveStrongMemberWarnings;
    haveWeakFamilyWarnings = haveWeakFamilyWarnings || haveWeakMemberWarnings;
  };
  ['chairman', 'vice_chairman', 'secretary'].forEach((roleKey) => {
    const member = members[roleKey];
    if (member) {
      addMember(roleKey, member);
    }
  });
  if (members.other) {
    if (isFull) {
      text += '\n\n';
      text += context.__n('members.other', members.other.length);
      members.other.forEach((member, index) => {
        addMember('other', member, index + 1);
      });
    } else {
      members.other.forEach((member) => {
        if (Array.isArray(member.related_to.venue)) {
          haveCriticalWarnings = true;
        }
        if (member.relative_candidates) {
          if (hasStrongGuess(member.relative_candidates.summary.strong_guesses)) {
            haveStrongWarnings = true;
          } else {
            haveWeakFamilyWarnings = true;
          }
        }
      });
    }
  }
  if (!isFull) {
    const args = {
      id: commissionId,
      id_latin: cyrillicToLatin(commissionId),
      warning: (haveCriticalWarnings ? context.__('emoji.warning.critical') : haveStrongWarnings ? context.__('emoji.warning.strong') : haveWeakFamilyWarnings ? context.__('emoji.warning.search') : '')
    };
    buttons.push([{
      text: context.__('emoji.alias.members') + ' ' + context.__('members.more.' + commissionLevel, args).trim(),
      callback_data: '/members ' + commissionLevel + '_' + commissionId
    }]);
  }
  return {
    text,
    buttons,
    members_with_relatives: membersWithRelatives,
    members_siblings_count: membersSiblingsCount,
    source_date: membersInfo.source_date ? new Date(membersInfo.source_date) : null
  };
}

function buildProtocolsReview (context, electionData, allProtocols, isFull) {
  if (empty(allProtocols)) {
    return null;
  }
  let order = ['federal', 'city', 'municipality'];
  const inline_keyboard = [];
  allProtocols.sort((a, b) => {
    const aIndex = order.indexOf(a.electoral_district.type);
    const bIndex = order.indexOf(b.electoral_district.type);
    if (aIndex !== bIndex) {
      return aIndex < bIndex ? -1 : 1;
    }
    if (a.empty !== b.empty) {
      return a.empty ? 1 : -1;
    }
    if (!a.empty && a.metadata.voters.registered_count != b.metadata.voters.registered_count) {
      return a.metadata.voters.registered_count < b.metadata.voters.registered_count ? 1 : -1;
    }
    return 0;
  });
  let text = '';
  let lastHeader = null;
  let count = 0;
  allProtocols.forEach((protocol) => {
    if (!isFull) {
      const info_url = context.__('url.info.' + protocol.electoral_district.type + (protocol.electoral_district.municipality ? '.' + protocol.electoral_district.municipality : ''));
      const header = context.__('election.' + protocol.electoral_district.type, {
        info_url,
        municipality: protocol.electoral_district.municipality
      });
      if (header !== lastHeader) {
        lastHeader = header;
        if (text.length) {
          text += '\n\n';
        }
        text += context.__('emoji.alias.result_bars') + ' <b>' + header + '</b>';
        // count = 0;
      }
      text += '\n\n';
      text += (++count) + '. ';
    }
    const review = buildProtocolReview(context, electionData, protocol, isFull);
    text += review.text;
    inline_keyboard.push(... review.inline_keyboard);
  });
  text += '\n\n';
  const protocolCount = arraySum(allProtocols, (protocol) => protocol.metadata.analysis.protocol_count);
  text += context.__('emoji.warning.info') + ' <i>' + context.__n('disclaimer.' + allProtocols[0].protocol_scope.type, protocolCount, {scope_id: allProtocols[0].protocol_scope.id}) + '</i>';
  return {text, inline_keyboard};
}

function buildProtocolReview (context, electionData, protocol, isFull) {
  const inline_keyboard = [];
  let text = '';

  if (!isFull) {
    text += '<b>';
    if (!protocol.electoral_district.id) {
      text += context.__('electoral_district.parties', {info_url: context.__('url.info.parties.' + protocol.electoral_district.type)})
    } else if (protocol.electoral_district.municipality) {
      text += context.__('electoral_district.multiple.one', {id: protocol.electoral_district.id});
    } else {
      text += context.__('electoral_district.single.one', {id: protocol.electoral_district.id});
    }
    text += '</b>';
  }

  const facts = [];
  if (protocol.metadata.voters.registered_count) {
    (isFull ? ['initially_registered_count'] : []).concat([
      'registered_count',
      'added_count',
      'removed_count',
      'attached_count',
      'detached_count'
    ]).forEach((key) => {
      const value = protocol.metadata.voters[key] || 0;
      if (value || (key === 'attached_count' && protocol.electoral_district.type === 'federal')) {
        facts.push(context.__n('analysis.' + key, value, {percentage: toDisplayPercentage(value / protocol.metadata.voters.registered_count * 100)}));
      }
    });
    ['valid_count', 'invalid_count', 'lost_count', 'ignored_count', 'taken_home_count'].forEach((key) => {
      const value = protocol.metadata.papers[key] || 0;
      if (value) {
        facts.push(context.__n('analysis.' + key, value, {percentage: toDisplayPercentage(value / protocol.metadata.voters.registered_count * 100)}));
      }
    });
  }
  if (protocol.metadata.analysis.exceeded_papers_count) {
    facts.push(context.__n('analysis.exceeded_papers_count', protocol.metadata.analysis.exceeded_papers_count) + context.__(protocol.metadata.analysis.exceeded_papers_steal_winning || protocol.metadata.analysis.exceeded_papers_provide_extra_places ? 'emoji.violation.stealing' : 'emoji.violation.exceeding'));
    if (isFull && protocol.protocol_scope.type === 'uik') {
      const formula = context.commission.analysis[protocol.electoral_district.type][protocol.electoral_district.id ? 'exceeded_person_voters_count' : 'exceeded_party_voters_count'].formula;
      facts.push(context.__('analysis.exceeded_papers_formula.format', {formula: formula.map((item) => typeof item === 'string' ? item : context.__('analysis.exceeded_papers_formula.' + item.key) + ' (' + item.value + ')').join(' ')}));
    }
  }
  if (protocol.protocol_scope.type === 'uik' && protocol.metadata.analysis.invalid_protocol_count) {
    facts.push(context.__('analysis.invalid_protocol') + ' ' + context.__('emoji.warning.cross'));
  }

  if (facts.length) {
    if (text.length)
      text += '\n';
    text += facts.map((item) => '•  ' + item).join('\n');
    facts.length = 0;
  }

  if (isFull) {
    const turnoutProtocols = protocol.turnout_protocols || protocol.turnout_protocols_stats;
    const isStats = !protocol.turnout_protocols;
    if (!empty(turnoutProtocols)) {
      text += '\n\n' + context.__('protocol.report.turnout') + ': ' + toDisplayPercentage(protocol.official_result.turnout.percentage, true) + '% (' + context.__n('people', protocol.official_result.turnout.count) + ')';
      text += '\n\n' + Object.keys(turnoutProtocols).map((day) => {
        const turnout = turnoutProtocols[day];
        let report = '<b>' + day + '</b>: ';
        const percentageSum = isStats ? countValues(turnout, (item) => item.count_delta.sum || 0) / protocol.metadata.voters.registered_count * 100 : countValues(turnout, (item) => item.percentage_delta || 0);
        report += (percentageSum >= 0 ? '+' : '-') + toDisplayPercentage(Math.abs(percentageSum), true) + '%';
        const countSum = isStats ? countValues(turnout, (item) => item.count_delta.sum) : countValues(turnout, (item) => item.count_delta);
        if (countSum) {
          report += ' (' + (countSum >= 0 ? '+' : '-') + context.__n('people', Math.abs(countSum)) + ')';
        }
        for (const time in turnout) {
          const obj = turnout[time];
          if (empty(obj)) {
            continue;
          }
          report += '\n';
          const registeredCount = isStats ? protocol.metadata.voters.registered_count : obj.registered_count || protocol.metadata.voters.registered_count;
          const percentageDelta = isStats ? obj.count_delta.sum / registeredCount * 100 : obj.percentage_delta;
          const registeredCountDelta = isStats && obj.registered_count_delta ? obj.registered_count_delta.sum : obj.registered_count_delta;
          report += time + ' — ' + ((percentageDelta >= 0 ? '+' : '-') + toDisplayPercentage(Math.abs(percentageDelta), true)) + '%';
          const extra = [];
          const countDelta = isStats ? obj.count_delta.sum : obj.count_delta;
          if (countDelta) {
            extra.push((countDelta < 0 ? '-' : '+') + context.__n('people', Math.abs(countDelta)));
          }
          if (registeredCountDelta) {
            extra.push((registeredCountDelta < 0 ? '-' : registeredCountDelta < registeredCount ? '+' : '') + context.__n('registered_voters', Math.abs(registeredCountDelta)));
          }
          if (extra.length) {
            report += ' (' + extra.join(', ') + ')';
          }
          if (obj.overnight_changes) {
            report += ' ' + context.__('emoji.warning.strong');
          } else if (obj.overnight_registry_changes || countDelta < 0) {
            report += ' ' + context.__('emoji.alias.question');
          }
          if (!isStats) {
            const byHour = obj.count_delta_per_minute < 1;
            const growthByTime = byHour ? obj.count_delta_per_hour : obj.count_delta_per_minute;
            if (growthByTime) {
              report += ' — ' + (growthByTime > 0 ? '+' : '') + context.__n(byHour ? 'people_per_hour' : 'people_per_minute', growthByTime);
            }
          }
        }
        return report;
      }).join('\n\n');
    }
    /*if (!protocol.empty && !empty(protocol.official_result.turnout)) {
      text += '\n\n' + context.__('protocol.report.turnout_final');
      text += '\n' + '20:00 — ' + toDisplayPercentage(protocol.official_result.turnout.percentage) + '%' + (protocol.official_result.turnout.count ? ' (' + context.__n('people', protocol.official_result.turnout.count) + ')' : '');
    }*/
    if (!empty(protocol.entries)) {
      text += '\n\n' + context.__('protocol.report.result.header');
      text += '\n\n' + protocol.entries.map((entry, index) => {
        if (!entry.official_result.votes_count) {
          return null;
        }
        const candidate = entry.party_id ? electionData.parties[entry.party_id] : electionData.candidates[entry.candidate_id];
        let report = Math.floor(entry.official_result.place) + '. ' + (entry.official_result.place % 1.0 !== 0 ? '(' + Math.round(1.0 / (entry.official_result.place % 1.0)) + ') ' : '');
        report += '<code>';
        if (entry.party_id) {
          let partyName = isWellKnownPartyAbbreviation(candidate.name.abbreviation) ? candidate.name.abbreviation : candidate.name.full;
          if (context.isLatinLocale) {
            partyName = context.__('party_name.' + partyName);
          }
          report += partyName;
        } else {
          report += context.isLatinLocale ? cyrillicToLatin(entry.name) : entry.name;
        }
        report += '</code>';
        report += '\n';
        let facts = [];
        let mainResult = context.__n('votes', entry.official_result.votes_count) + ' (' + toDisplayPercentage(entry.official_result.valid_percentage) + '%)';
        facts.push(mainResult);
        if (entry.official_stats) {
          ['average', 'min', 'max', 'median'].forEach((key) => {
            let validPercentage = entry.official_stats.valid_percentage[key];
            let votesCount = entry.official_stats.votes_count[key];
            let validPercentageUik = 0, votesCountUik = 0;
            if (typeof validPercentage === 'object') {
              const firstKey = Object.keys(validPercentage)[0];
              validPercentageUik = firstKey.substring(1).split(',').map((item) => parseInt(item));
              validPercentage = validPercentage[firstKey];
            }
            if (typeof votesCount === 'object') {
              const firstKey = Object.keys(votesCount)[0];
              votesCountUik = firstKey.substring(1).split(',').map((item) => parseInt(item));
              votesCount = votesCount[firstKey];
            }
            if (votesCountUik) {
              if (arrayEquals(votesCountUik, validPercentageUik)) {
                // Same UIK
                facts.push(context.__('protocol.report.votes.same_uik.' + key, {
                  votes_count: context.__n('votes', Math.floor(votesCount)),
                  percentage: toDisplayPercentage(validPercentage),
                  commission_id: '№' + votesCountUik.join(',')
                }));
              } else {
                // Different UIK
                facts.push(context.__('protocol.report.votes.different_uik.' + key, {
                  votes_count: context.__n('votes', Math.floor(votesCount)),
                  percentage: toDisplayPercentage(validPercentage),
                  votes_commission_id: '№' + votesCountUik.join(','),
                  percentage_commission_id: '№' + validPercentageUik.join(',')
                }));
              }
            } else {
              facts.push(context.__n('protocol.report.votes.' + key, Math.floor(votesCount), {
                percentage: toDisplayPercentage(validPercentage)
              }));
            }
          });
        }
        report += facts.map((item) => '• ' + item).join('\n');
        return report;
      }).filter((item) => item !== null).join('\n\n');
    }
  } else {
    inline_keyboard.push([newResultButton(context, protocol)]);
  }

  return {text, inline_keyboard};
}

function getRoleKey (role) {
  switch (role) {
    case 'Председатель':
      return 'chairman';
    case 'Зам.председателя':
      return 'vice_chairman';
    case 'Секретарь':
      return 'secretary';
    case 'Член комиссии':
      return 'other';
  }
  throw Error(role);
}

function newResultButton (context, protocol) {
  const electoralDistrictId = (protocol.electoral_district.id ? ((protocol.electoral_district.municipality ? protocol.electoral_district.municipality + '_' : '') + protocol.electoral_district.id) : 'parties');
  return {
    text: context.__('emoji.alias.result_bars') + ' ' + context.__('electoral_district.alias.' + protocol.electoral_district.type + '.' + (protocol.electoral_district.id ? 'person' : 'parties'), {
      id: protocol.electoral_district.id,
      municipality: protocol.electoral_district.municipality,
      municipality_latin: cyrillicToLatin(protocol.electoral_district.municipality)
    }) + (protocol.protocol_scope.type !== 'gik' ? ' ' + context.__('emoji.alias.' + protocol.protocol_scope.type) : ''),
    callback_data: '/r ' + (protocol.protocol_scope.type === 'uik' ? [
      protocol.protocol_scope.type, protocol.protocol_scope.id, protocol.electoral_district.type, electoralDistrictId
    ] : [
      protocol.protocol_scope.type, protocol.electoral_district.type, electoralDistrictId, (protocol.protocol_scope.type === 'district' ? shortenDistrict(protocol.protocol_scope.id) : protocol.protocol_scope.id)
    ]).join('/')
  };
}

async function launchBot (token, electionData) {
  const botUserId = parseInt(token.substring(0, token.indexOf(':')));
  if (!botUserId) {
    throw Error('Invalid bot token! ' + token);
  }
  console.log('Launching bot', botUserId);
  const databaseDir = './database/' + botUserId;
  fs.mkdirSync(databaseDir, {recursive: true});
  const db = level(databaseDir);

  const bot = new TelegramBot(token, {
    polling: {
      autoStart: false,
      params: {
        timeout: 25
      }
    },
    filepath: false
  });

  const onGlobalError = (globalError) => {
    console.log('Global error…', globalError);
  };
  const onIOError = (ioError) => {
    console.log('I/O error…', localError);
  };
  const onLocalError = (localError) => {
    console.log('Local error…', localError);
  };
  const onPollingError = (pollingError) => {
    console.log('Polling error…', pollingError);
  };

  // UTILS

  const toInputMessageContent = (message) => {
    if (message.photo) {
      return {
        type: 'photo',
        media: message.photo[0].file_id,
        caption: message.caption,
        caption_entities: message.caption_entities
      };
    } else if (message.video) {
      return {
        type: 'video',
        media: message.video.file_id,
        caption: message.caption,
        caption_entities: message.caption_entities
      };
    } else if (message.audio) {
      return {
        type: 'audio',
        media: message.audio.file_id,
        caption: message.caption,
        caption_entities: message.caption_entities
      };
    } else if (message.document) {
      return {
        type: 'document',
        media: message.document.file_id,
        caption: message.caption,
        caption_entities: message.caption_entities
      };
    } else {
      return null;
    }
  };

  const forwardAsCopy = (chatId, replyToMessageId, disableNotification, message) => {
    // forward as copy
    if (message.text) {
      return bot.sendMessage(chatId, message.text, {
        reply_to_message_id: replyToMessageId,
        disable_notification: !!disableNotification,
        entities: message.entities ? JSON.stringify(message.entities) : ''
      });
    } else if (message.photo) {
      return bot.sendPhoto(chatId, message.photo[0].file_id, {
        reply_to_message_id: replyToMessageId,
        disable_notification: !!disableNotification,
        caption: message.caption,
        caption_entities: message.caption_entities
      });
    } else if (message.video) {
      return bot.sendVideo(chatId, message.video.file_id, {
        reply_to_message_id: replyToMessageId,
        disable_notification: !!disableNotification,
        caption: message.caption,
        caption_entities: message.caption_entities
      });
    } else if (message.document) {
      return bot.sendDocument(chatId, message.document.file_id, {
        reply_to_message_id: replyToMessageId,
        disable_notification: !!disableNotification,
        caption: message.caption,
        caption_entities: message.caption_entities
      });
    } else if (message.audio) {
      return bot.sendAudio(chatId, message.audio.file_id, {
        reply_to_message_id: replyToMessageId,
        disable_notification: !!disableNotification,
        caption: message.caption,
        caption_entities: message.caption_entities
      });
    } else if (message.voice) {
      return bot.sendVoice(chatId, message.voice.file_id, {
        reply_to_message_id: replyToMessageId,
        disable_notification: !!disableNotification,
        caption: message.caption,
        caption_entities: message.caption_entities
      });
    } else if (message.sticker) {
      return bot.sendSticker(chatId, message.sticker.file_id, {
        reply_to_message_id: replyToMessageId,
        disable_notification: !!disableNotification
      });
    } else if (message.video_note) {
      return bot.sendVideoNote(chatId, message.video_note.file_id, {
        reply_to_message_id: replyToMessageId,
        disable_notification: !!disableNotification
      });
    } else {
      console.error('Cannot forward as copy!', message);
      return null;
    }
  };

  const handleAdminMessage = (message) => {
    // message inside admin chat
    if (message.reply_to_message) {
      const key = 'origin_' + message.chat.id + '_' + message.reply_to_message.message_id;
      db.get(key, {valueEncoding: 'json'}, (err, origin) => {
        if (!err) {
          const copyMethod = forwardAsCopy(origin.chat_id, origin.message_id, true, message);
          if (copyMethod) {
            copyMethod.then((messageCopy) => {
              if (!messageCopy)
                return;
              const key = 'origin_' + message.chat.id + '_' + message.message_id;
              const value = {chat_id: messageCopy.chat.id, message_id: messageCopy.message_id};
              db.put(key, value, {valueEncoding: 'json'});
              bot.sendMessage(message.chat.id, '✅ <b>Delivery succeeded</b> to <b>' + htmlUserName(messageCopy.chat) + '</b>.', {parse_mode: 'HTML', reply_to_message_id: message.message_id, disable_notification: true}).catch(onGlobalError);
            }).catch((e) => {
              console.log('Reply delivery failed', e);
              bot.sendMessage(message.chat.id, '🚫 <b>Delivery failed</b>: <code>' + htmlEncode(e.message) + '</code>', {parse_mode: 'HTML', reply_to_message_id: message.message_id, disable_notification: true}).catch(onGlobalError);
            });
          }
        }
      });
      return;
    }
  };

  const htmlUserName = (user) => {
    return '<a href="tg://user?id=' + user.id + '">' +
      user.first_name + (user.last_name ? ' ' + user.last_name : '') +
      '</a>' + (user.username ? ' (@' + user.username + ')' : '');
  };

  const feedbackHandlers = {};
  const handleFeedback = (message, force) => {
    if (!force) {
      const feedbackHandler = feedbackHandlers[message.chat.id] || (feedbackHandlers[message.chat.id] = {
        message_groups: [],
        from: message.from,
        callback: () => {
          const cached = feedbackHandlers[message.chat.id];
          if (cached) {
            delete feedbackHandlers[message.chat.id];
            let totalMessageCount = 0;
            cached.message_groups.forEach((messageGroup) => {
              totalMessageCount += Array.isArray(messageGroup) ? messageGroup.length : 1;
            });
            bot.sendMessage(ADMIN_CHAT_ID,
              '📥 Received <b>' + totalMessageCount + ' message' + (totalMessageCount != 1 ? 's' : '') + '</b>' +
              ' from ' +
              '<b>' +
              htmlUserName(cached.from) +
              '</b>:', {
                parse_mode: 'HTML',
                disable_notification: true
              }).then((sentMessage) => {
              if (sentMessage) {
                let firstMessage = cached.message_groups[0];
                if (Array.isArray(firstMessage)) {
                  firstMessage = firstMessage[0];
                }
                const key = 'origin_' + sentMessage.chat.id  + '_' + sentMessage.message_id;
                const value = {chat_id: firstMessage.chat.id, message_id: firstMessage.message_id};
                db.put(key, value, {valueEncoding: 'json'});
                cached.message_groups.forEach((messageGroup) => {
                  handleFeedback(messageGroup, true);
                });
              }
            }).catch(onGlobalError);
          }
        }
      });
      if (feedbackHandler.callback_id !== undefined) {
        clearTimeout(feedbackHandler.callback_id);
      }
      if (message.media_group_id) {
        const lastGroup = feedbackHandler.message_groups.length ?
          feedbackHandler.message_groups[feedbackHandler.message_groups.length - 1] :
          null;
        if (lastGroup && Array.isArray(lastGroup) && lastGroup[0].media_group_id == message.media_group_id) {
          lastGroup.push(message);
        } else {
          feedbackHandler.message_groups.push([message]);
        }
      } else {
        feedbackHandler.message_groups.push(message);
      }
      feedbackHandler.callback_id = setTimeout(feedbackHandler.callback, 3500);
      return;
    }
    if (Array.isArray(message) && message.length == 1) {
      message = message[0];
    }
    if (Array.isArray(message)) {
      const mediaGroup = [];
      message.forEach((groupMessage) => {
        mediaGroup.push(toInputMessageContent(groupMessage));
      });
      bot.sendMediaGroup(ADMIN_CHAT_ID, mediaGroup, {disable_notification: true}).then((sentMessages) => {
        if (!sentMessages)
          return;
        sentMessages.forEach((sentMessage, index) => {
          const originalMessage = message[index];
          if (sentMessage) {
            const key = 'origin_' + sentMessage.chat.id  + '_' + sentMessage.message_id;
            const value = {chat_id: originalMessage.chat.id, message_id: originalMessage.message_id};
            db.put(key, value, {valueEncoding: 'json'});
          }
        });
      }).catch(onGlobalError);
    } else {
      bot.forwardMessage(ADMIN_CHAT_ID, message.chat.id, message.message_id, {disable_notification: true}).then((sentMessage) => {
        if (sentMessage) {
          const key = 'origin_' + sentMessage.chat.id  + '_' + sentMessage.message_id;
          const value = {chat_id: message.chat.id, message_id: message.message_id};
          db.put(key, value, {valueEncoding: 'json'});
        }
      }).catch(onGlobalError);
    }
  };

  const parseCommissionContext = (context, origin, electionData) => {
    if (context.args) {
      const args = context.args.split('_');
      if (!['gik', 'tik', 'uik'].includes(args[0])) {
        return false;
      }
      const commissionLevel = args[0];
      const commissionId = args.length > 1 ? parseInt(args[1]) : undefined;

      if (commissionId || commissionLevel === 'gik') {
        context.commission_level = commissionLevel;
        context.commission_id = commissionId || electionData.gik.id;
      } else {
        return false;
      }

      if (commissionLevel) {
        switch (commissionLevel) {
          case 'gik':
            context.commission = electionData.gik;
            break;
          case 'tik':
            context.commission = electionData.gik.tiks[context.commission_id];
            break;
          case 'uik':
            context.commission = electionData.uiks[context.commission_id];
            break;
        }
      }
    } else {
      context.global = true;
    }
    return true;
  };

  const resultOptions = [
    'votes_dynamics',
    'turnout',
    'by_tik',
    'sort_by_tik',
    'edit_message',
    'turnout_count'// ,
    // 'comet'
  ];
  const cleanGraphOptions = (opts) => {
    let found = false;
    ['votes_dynamic', 'turnout', 'turnout_count', 'comet'].forEach((key) => {
      if (opts[key]) {
        if (found) {
          delete opts[key];
        } else {
          found = true;
        }
      }
    });
    if (opts.by_tik && opts.sort_by_tik) {
      delete opts.sort_by_tik;
    }
  };
  const graphOption = (option) => {
    const index = resultOptions.indexOf(option);
    if (index === -1)
      throw Error('Unknown option: ' + option);
    return 1 << index;
  };
  const graphOptions = (opts, filter) => {
    let flags = 0;
    for (const option in opts) {
      if (opts.hasOwnProperty(option) && opts[option] && (!filter || filter(option))) {
        flags |= graphOption(option);
      }
    }
    return flags;
  };
  const graphCacheOptions = (options) => {
    return graphOptions(options, (key) => key !== 'edit_message');
  };

  const parseResultContext = (context, origin, electionData) => {
    if (!context.args)
      return false;
    ['path', 'level', 'options', 'flags', 'cleanArgs', 'level_id', 'result', 'commission', 'district'].forEach((key) => {
      delete context[key];
    });
    let stringArgs = context.args;
    console.log('Parsing', stringArgs);
    let splitter = stringArgs.indexOf('/');
    if (splitter === -1)
      return false;

    const spaceIndex = stringArgs.lastIndexOf(' ', splitter);

    const defaultFlags = graphOption('votes_dynamics');
    let flags = defaultFlags; // default options
    if (spaceIndex !== -1) {
      flags = parseInt(stringArgs.substring(0, spaceIndex));
      if (!flags) {
        flags = defaultFlags;
      }
      stringArgs = stringArgs.substring(spaceIndex + 1);
    }
    let remainingFlags = flags;
    const options = {};
    for (let i = 0; i < resultOptions.length; i++) {
      const flag = (1 << i);
      if ((remainingFlags & flag) === flag) {
        options[resultOptions[i]] = true;
        remainingFlags &= ~flag;
      }
    }
    if (remainingFlags) {
      return false; // protection against DoS attacks
    }
    if (options.edit_message && !(origin.message_id || origin.inline_message_id)) {
      delete options.edit_message;
    }
    cleanGraphOptions(options);
    context.flags = graphOptions(options);
    context.cleanArgs = stringArgs.replace(/(?<=\/)parties(?=\/)/g, '0');

    const args = stringArgs.split('/');
    const level = args.shift();
    const path = args.join('/');

    if (['gik', 'district', 'tik', 'uik'].includes(level)) {
      context.level = level;
      context.path = path;
      context.options = options;

      let results = electionData['results_by_' + level];
      if (level === 'uik') {
        const levelId = args.shift();
        context.level_id = parseInt(levelId);
        results = results[levelId];
      } else {
        context.level_id = null;
      }
      context.electoral_district_type = args.length ? args[0] : undefined;
      context.electoral_district_id = args.length > 1 ? args[1] === '0' ? 'parties' : args[1] : undefined;
      if (context.electoral_district_id === 'parties') {
        // do nothing
      } else if (context.electoral_district_type === 'municipality' && context.electoral_district_id) {
        const args = context.electoral_district_id.split('_');
        if (args.length == 2) {
          context.municipality = args[0];
          context.municipality_district_id = parseInt(args[1]);
          if (!context.municipality || !context.municipality_district_id) {
            return false;
          }
        }
      } else if (context.electoral_district_id) {
        context.electoral_district_id = parseInt(context.electoral_district_id);
      }

      let arg = null, prevArg = null;
      while (results && args.length) {
        prevArg = arg;
        arg = args.shift();
        if (results.protocol_scope) { // it means we reached the end
          const candidateId = parseInt(arg);
          if (!context.focus_entry_id && candidateId) {
            const entry = findCandidate(results.entries, candidateId);
            if (entry) {
              context.focus_entry = entry;
              context.focus_entry_id = candidateId;
              arg = prevArg;
              continue;
            }
          }
          throw Error(arg);
        }
        let parent = results[arg];
        if (parent) {
          results = parent;
          continue;
        }
        const numeric = parseInt(arg);
        if (numeric === 0) {
          results = results.parties;
        } else if (numeric || results['person_' + arg]) {
          results = results['person_' + arg];
        } else if (level === 'district') {
          arg = unshortenDistrict(arg);
          results = results[arg];
        } else {
          results = null;
        }
      }
      if (level !== 'uik') {
        context.level_id = arg;
      }
      if (args.length == 0 && results && results.ballot_name) {
        context.result = results;
      }
      if (context.level) {
        switch (context.level) {
          case 'gik':
            context.commission = electionData.gik;
            break;
          case 'tik':
            context.commission = electionData.gik.tiks[context.level_id];
            break;
          case 'uik':
            context.commission = electionData.uiks[context.level_id];
            break;
          case 'district':
            context.district = context.level_id;
            break;
        }
      }
      if (context.level && context.path && (context.commission || context.district)) {
        if (results) {
          let cacheKeySuffix = graphCacheOptions(options) + '_' + context.activeLocale + '_' + results.protocol_scope.type + '/' + (
              results.protocol_scope.type === 'district' ? shortenDistrict(results.protocol_scope.id) :
                results.protocol_scope.id
            ) + '/' + results.electoral_district.type + '/' +
            (results.electoral_district.municipality ? results.electoral_district.municipality + '_' : '') +
            (results.electoral_district.id || 'parties');
          if (context.focus_entry_id) {
            cacheKeySuffix += '/' + context.focus_entry_id;
          }
          context.cache_key_suffix = cacheKeySuffix;
        }
        return true;
      }
      return false;
    }

    return false;
  };

  const runChartProgram = async (context, origin, electionData, options, graphCallback) => {
    const startTime = Date.now();
    if (!(options.votes_dynamics || options.turnout || options.turnout_count || options.comet)) {
      return; // Unknown chart program
    }
    // data

    const areBars = options.turnout || options.turnout_count;

    const inline_keyboard = [];

    const commission = context.commission;
    const commissionAddress = commission ? electionData.addresses[commission.address_id] : null;
    const district = context.district || commission.district;
    const result = context.result;

    const electoralDistrictType = context.electoral_district_type;
    const isParty = context.electoral_district_id === 'parties';

    if (!result || result.empty) {
      return await bot.sendMessage(origin.chat.id, context.__('emoji.warning.critical') + ' ' + context.__('result.notFound'), {
        parse_mode: 'HTML'
      });
    }

    const resultEmoji = context.__(areBars ? 'emoji.alias.result_bars' : 'emoji.alias.result');
    if (options.turnout || options.turnout_count) {
      let items = [];
      const keys = ['turnout', 'turnout_count'];
      const all = {};
      keys.forEach((otherKey) => all[otherKey] = true);
      keys.forEach((key) => {
        let flags = (context.flags | graphOption('edit_message'));
        flags &= ~graphOptions(all);
        flags |= graphOption(key);
        items.push({
          text: context.__(options[key] ? 'emoji.alias.selected' : 'emoji.alias.unselected') + ' ' + context.__('visual.toggle.' + key),
          callback_data: options[key] ? '/e' : '/g ' + (flags ? flags + ' ' : '') + context.cleanArgs
        });
      });
      inline_keyboard.push(items);
    }

    inline_keyboard.push([{
      text: (!context.focus_entry_id ? context.__('emoji.alias.selected') : context.__('emoji.alias.people')) + ' ' + context.__(context.result.entries[0].party_id ? 'visual.all_parties' : 'visual.all_candidates'),
      callback_data: !context.focus_entry_id ? '/e' : '/g ' + (context.flags | graphOption('edit_message')) + ' ' + (context.focus_entry_id ? context.cleanArgs.replace(/\/-?\d+$/g, '') : context.cleanArgs)
    }]);
    context.result.entries.forEach((entry) => {
      const candidateId = entry.party_id || entry.candidate_id;
      const isSelected = context.focus_entry_id && candidateId === context.focus_entry_id;
      let text = (isSelected ? context.__('emoji.alias.selected') : context.__(entry.party_id ? 'emoji.alias.people' : 'emoji.alias.person')) + ' ' + context.__('visual.turnout_for', {name: getEntryName(context, electionData, entry)});
      if (entry.supported_by_smart_vote) {
        text += ' ' + context.__('emoji.alias.smart');
      }
      inline_keyboard.push([{
        text,
        callback_data: isSelected ? '/e' : '/g ' + (context.flags | graphOption('edit_message')) + ' ' + (context.focus_entry_id ? context.cleanArgs.replace(/\/-?\d+$/g, '') : context.cleanArgs) + '/' + candidateId
      }]);
    });
    if (options.turnout || options.turnout_count) {
      // TODO metadata for turnout
    }

    const navigationFlags = context.flags & (~graphOptions({
      by_tik: true,
      sort_by_tik: true
    })) | graphOption('edit_message');

    if (commission) {
      let items = [];
      items.push({
        text: context.__('emoji.alias.' + commission.type) + ' ' + context.__('commission.short.' + commission.type, {id: commission.id, id_latin: cyrillicToLatin(commission.id)}),
        callback_data: '/commission ' + commission.type + '_' + commission.id
      });
      let parent = commission.parent_commission;
      if (parent) {
        do {
          if (items.length === 2) {
            inline_keyboard.push(items);
            items = [];
          }
          const protocol = context.result;
          const forceTik = (!protocol.electoral_district.id || protocol.electoral_district.type === 'federal');
          if (parent.type === 'gik' && commission.district) {
            const districtProtocol = forceTik ? electionData.results_by_district[protocol.electoral_district.type][protocol.electoral_district.id ? 'person_' + protocol.electoral_district.id : 'parties'][commission.district] : null;
            if (districtProtocol && Array.isArray(districtProtocol.related_to.tik)) {
              const flags = navigationFlags | (!(!options.by_tik && Array.isArray(result.related_to.tik)) ? graphOption('by_tik') : 0);
              inline_keyboard.push([{
                text: context.__('emoji.index.up') + resultEmoji + ' ' + (context.isLatinLocale ? cyrillicToLatin(commission.district) : commission.district),
                callback_data: '/g ' + (flags ? flags + ' ' : '') + ['district', districtProtocol.electoral_district.type, districtProtocol.electoral_district.id, shortenDistrict(commission.district)].concat(context.focus_entry_id ? [context.focus_entry_id] : []).join('/')
              }]);
            }
          }
          const parentProtocol = protocol.protocol_scope.type === 'uik' || forceTik ? electionData['results_by_' + parent.type][protocol.electoral_district.type][protocol.electoral_district.id ? 'person_' + protocol.electoral_district.id : 'parties'][parent.id] : null;
          if (parentProtocol) {
            const flags = navigationFlags | (parentProtocol && Array.isArray(parentProtocol.related_to.tik) && !(!options.by_tik && Array.isArray(result.related_to.tik)) ? graphOption('by_tik') : 0);
            items.push({
              text: context.__('emoji.index.up') + resultEmoji + ' ' + context.__('result.commission.short.' + parent.type, {id: parent.id}),
              callback_data: '/g ' + (flags ? flags + ' ' : '') + [parent.type, parentProtocol.electoral_district.type, parentProtocol.electoral_district.id, parent.id].concat(context.focus_entry_id ? [context.focus_entry_id] : []).join('/')
            });
          }
          parent = parent.parent_commission;
        } while (parent);
      }
      inline_keyboard.push(items);
    } else if (context.district) {
      const forceTik = (!result.electoral_district.id || result.electoral_district.type === 'federal');
      let items = [];
      inline_keyboard.push([{
        text: context.__('emoji.alias.district') + ' ' + (context.isLatinLocale ? cyrillicToLatin(context.district) : context.district),
        callback_data: '/d ' + context.district
      }]);
      let parent = {type: electionData.gik.type, id: electionData.gik.id};
      while (parent) {
        const parentProtocol = forceTik ? electionData['results_by_' + parent.type][result.electoral_district.type][result.electoral_district.id ? 'person_' + result.electoral_district.id : 'parties'][parent.id] : null;
        const flags = navigationFlags | (parentProtocol && Array.isArray(parentProtocol.related_to.tik) && !(!options.by_tik && Array.isArray(result.related_to.tik)) ? graphOption('by_tik') : 0);
        items.push({
          text: context.__('emoji.index.up') + resultEmoji + ' ' + context.__('result.commission.short.' + parent.type, {id: parent.id}),
          callback_data: '/g ' + (flags ? flags + ' ' : '') + [parent.type, parentProtocol.electoral_district.type, parentProtocol.electoral_district.id, parent.id].concat(context.focus_entry_id ? [context.focus_entry_id] : []).join('/')
        });
        parent = parent.parent_commission;
      }
      inline_keyboard.push(items);
    }

    if (Array.isArray(result.related_to.district) || Array.isArray(result.related_to.tik)) {
      if (context.district || (result.protocol_scope.type === 'gik' && !Array.isArray(result.related_to.district))) {
        let tikIds = Array.isArray(result.related_to.tik) ? result.related_to.tik : [result.related_to.tik];
        let items = null;
        for (let i = 0; i < tikIds.length; i++) {
          if (!items || items.length === 2) {
            items = [];
            inline_keyboard.push(items);
          }
          const id = tikIds[i];
          const flags = navigationFlags;
          items.push({
            text: context.__('emoji.index.down') + resultEmoji + ' ' + context.__('result.commission.short.tik', {id}),
            callback_data: '/g ' + (flags ? flags + ' ' : '') + ['tik', result.electoral_district.type, result.electoral_district.id, id].concat(context.focus_entry_id ? [context.focus_entry_id] : []).join('/')
          });
        }
      } else if (result.protocol_scope.type === 'gik') {
        let items = null;
        for (let i = 0; i < result.related_to.district.length; i++) {
          if (!items || items.length === 1) {
            items = [];
            inline_keyboard.push(items);
          }
          const district = result.related_to.district[i];
          const districtProtocol = electionData.results_by_district[result.electoral_district.type][result.electoral_district.id ? 'person_' + result.electoral_district.id : 'parties'][district];
          let flags = navigationFlags;
          if (Array.isArray(districtProtocol.related_to.tik)) {
            flags |= (!(!options.by_tik && Array.isArray(result.related_to.tik)) ? graphOption('by_tik') : 0);
            items.push({
              text: context.__('emoji.index.down') + resultEmoji + ' ' + (context.isLatinLocale ? cyrillicToLatin(district) : district),
              callback_data: '/g ' + (flags ? flags + ' ' : '') + ['district', districtProtocol.electoral_district.type, districtProtocol.electoral_district.id, shortenDistrict(district)].concat(context.focus_entry_id ? [context.focus_entry_id] : []).join('/')
            });
          } else {
            items.push({
              text: context.__('emoji.index.down') + resultEmoji + ' ' + (context.isLatinLocale ? cyrillicToLatin(district) : district),
              callback_data: '/g ' + (flags ? flags + ' ' : '') + ['tik', districtProtocol.electoral_district.type, districtProtocol.electoral_district.id, districtProtocol.related_to.tik].concat(context.focus_entry_id ? [context.focus_entry_id] : []).join('/')
            });
          }
        }
      }
    }

    if (context.cache_key_suffix && !graphCallback) {
      const graphCacheKey = 'graph_cache_' + context.cache_key_suffix;
      try {
        const cachedPhotoSize = await db.get(graphCacheKey, {valueEncoding: 'json'});
        if (cachedPhotoSize && cachedPhotoSize.version === CHARTS_VERSION /*&& !isDebug*/) {
          let edited = false;
          if (options.edit_message) {
            try {
              const target = clone(context.edit_message_target);
              Object.assign(target, {
                reply_markup: {inline_keyboard}
              });
              await bot.editMessageMedia({type: 'photo', media: cachedPhotoSize.file_id}, target);
              edited = true;
              context.toast = context.__('toast.chart_updated');
            } catch (e) {
              console.log('Cannot edit message', e);
            }
          }
          if (!edited) {
            await bot.sendPhoto(origin.chat.id, cachedPhotoSize.file_id, {
              parse_mode: 'HTML',
              reply_markup: {inline_keyboard}
            });
          }
          console.log('Graph', '"' + graphCacheKey + '"', 're-used and ' + (edited ? 'updated' : 'edited') + ' in', (Date.now() - startTime) / 1000.0, 'seconds.');
          return;
        }
      } catch (e) {
        console.log('Error re-using graph', e);
      }
    }

    // data (again)

    let commissionTypes = 'uik';
    let commissionIds, winner, topEntry;
    let displayResult = result;
    let highlightCommissionId = 0;
    let otherCommissions = null;
    let otherCommissionIds = null;

    if (commission && commission.type === 'uik') {
      const tikResults = electionData.results_by_tik[electoralDistrictType];
      const parentResult = tikResults[context.electoral_district_id] || tikResults['person_' + context.electoral_district_id];
      const tikResult = parentResult[commission.parent_commission.id];
      commissionIds = tikResult.related_to.uik;
      winner = tikResult.official_result.winner;
      topEntry = findTopWinner(tikResult.entries, winner);
      displayResult = tikResult;
      highlightCommissionId = commission.id;
      otherCommissions = commissionAddress ? allCommissionsOf(electionData, commissionAddress)
        .filter((otherCommission) => otherCommission.type !== commission.type || otherCommission.id != commission.id) : [];
      otherCommissionIds = otherCommissions.map((commission) => commission.id);
    } else if (options.by_tik) {
      commissionIds = result.related_to.tik;
      winner = result.official_result.winner;
      topEntry = findTopWinner(result.entries, winner);
      commissionTypes = 'tik';
    } else {
      commissionIds = result.related_to.uik;
      winner = result.official_result.winner;
      topEntry = findTopWinner(result.entries, winner);
    }
    commissionIds = Array.isArray(commissionIds) ? cloneArray(commissionIds) : commissionIds ? [commissionIds] : null;

    let commissionProtocols = null;
    if (commissionIds) {
      commissionProtocols = {};
      commissionIds.forEach((commissionId) => {
        let result = null;
        if (commissionTypes === 'tik') {
          let allResults = electionData.results_by_tik[context.electoral_district_type];
          if (allResults) {
            allResults = allResults[context.electoral_district_id] || allResults['person_' + context.electoral_district_id];
            if (allResults) {
              result = allResults[commissionId];
            }
          }
        } else {
          const results = electionData.results_by_uik[commissionId][context.electoral_district_type];
          result = results[context.electoral_district_id] || results['person_' + context.electoral_district_id];
        }
        if (result && !result.empty && result.metadata.papers.valid_count > 0) {
          commissionProtocols[commissionId] = result;
        }
      });
    }

    // canvas

    const canvas = new Canvas(1080 + 10 * (1080 / 720) * 2, 1080 * (3.5 / 3));
    const scale = (dp) => dp * Math.min(canvas.width / 720, canvas.height / 720);
    canvas.async = true;

    const c = canvas.getContext('2d');
    if (!(c instanceof CanvasRenderingContext2D))
      throw Error();

    // work

    const theme = themes.light;

    c.fillStyle = theme.filling;
    c.fillRect(0, 0, canvas.width, canvas.height);

    const watermark = context.__('watermark');

    c.font = font(scale(13), 'monospace');
    c.fillStyle = theme.textLight;
    c.textAlign = 'right';
    c.textBaseline = 'top';
    let watermarkRight = canvas.width - scale(8 + 13 - 6);
    const watermarkTop = scale(8 + 12 - 6);
    await fillTextWithTwemoji(c, watermark, watermarkRight, watermarkTop);

    const telegramLogo = await loadImage(path.join('images', 't_logo.png'));
    watermarkRight -= measureText(c, watermark).width + scale(8);
    c.drawImage(telegramLogo, watermarkRight - scale(14), scale(13), scale(18), scale(18));

    let resultTitle = '';
    resultTitle += context.__('emoji.alias.result') + ' ';
    resultTitle += context.__('result.' + context.electoral_district_type + '.' + (isParty ? 'parties' : 'person'), {id: (context.municipality_district_id || context.electoral_district_id), municipality: context.municipality, municipality_latin: cyrillicToLatin(context.municipality)});

    let scopeTitle = '';
    if (commission) {
      scopeTitle += context.__('emoji.alias.' + commission.type) + ' ' + context.__('result.commission.medium.' + commission.type, {id: commission.id, id_latin: cyrillicToLatin(commission.id)});
    } else {
      scopeTitle += context.__(district === 'Голосование за рубежом' ? 'emoji.address.abroad' : 'emoji.alias.district') + ' ' + districtName(context, district);
    }

    c.font = font(scale(26), 'medium');
    c.fillStyle = theme.text;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    await fillTextWithTwemoji(c, resultTitle, scale(8), scale(8));

    let currentY = scale(8 + 26 + 8);
    if (scopeTitle) {
      c.font = font(scale(22));
      c.fillStyle = theme.textLight;
      await fillTextWithTwemoji(c, scopeTitle, scale(8 + (26 - 22) / 2), currentY);
      currentY += scale(22 + 8);
    }

    currentY += scale(8);

    let subtitles = [];

    if (commission) {
      if (commissionAddress) {
        let array = [];
        if (commission.type !== 'gik') {
          const displayAddress = Object.keys(commissionAddress.address).filter((key) =>
            (commissionAddress.type !== 'district_administration' && key === 'district') || key === 'street' || key === 'building'
          ).sort((a, b) => a === 'district' ? 1 : b === 'district' ? -1 : 0).map((key) => commissionAddress.address[key]).join(', ');
          array.push(context.__(commissionAddress.abroad ? 'emoji.address.country.' + commissionAddress.address.country : 'emoji.address.' + commissionAddress.type) + ' ' + venueName(context, commissionAddress));
          array.push(context.__('emoji.alias.location') + ' ' + (context.isLatinLocale ? cyrillicToLatin(displayAddress) : displayAddress));
        }
        subtitles.push(...array);
        if (otherCommissionIds && otherCommissionIds.length) {
          subtitles.push(context.__('emoji.index.right') + ' ' + context.__('also_here.' + commission.type) + ': ' + otherCommissionIds.join(', '));
        }
      }
      if (commission.parent_commission) {
        let subtitle = '';

        subtitle += context.__('emoji.index.up') + ' ' + context.__('commission.parent') + ': ';
        subtitle += context.__('emoji.alias.' + commission.parent_commission.type) + ' ' + context.__('commission.short.' + commission.parent_commission.type, {id: commission.parent_commission.id, id_latin: cyrillicToLatin(commission.parent_commission.id)});

        subtitles.push(subtitle);
      } else if (Array.isArray(result.related_to.district)) {
        if (result.related_to.district.length < 5) {
          subtitles.push(context.__('emoji.alias.map_location') + ' ' + context.__('polling.district.few') + ': ' + result.related_to.district.map((district) => {
            const shortened = shortenDistrict(districtName(context, district));
            return shortened === 'abroad' ? context.__(shortened) : shortened;
          }).join(', '));
        } else {
          subtitles.push(context.__('emoji.alias.map_location') + ' ' + context.__n('districts', result.related_to.district.length));
        }
      } else if (result.related_to.district) {
        const shortened = shortenDistrict(districtName(context, result.related_to.district));
        if (shortened === 'abroad') {
          subtitles.push(context.__(shortened));
        } else {
          subtitles.push(context.__('emoji.alias.map_location') + ' ' + context.__('polling.district.one') + ': ' + shortened);
        }
      }
    }
    const protocolCount = highlightCommissionId ? 1 : result.metadata.analysis.protocol_count; // ;arraySum(Object.values(commissionProtocols), (protocol) => (!protocol.empty && f) ? protocol.metadata.analysis.protocol_count : 0);
    if (protocolCount > 1) {
      subtitles.push(context.__('emoji.warning.info') + ' ' + context.__n('disclaimer.protocols', protocolCount));
    }

    c.font = font(scale(16));
    if (subtitles.length) {
      for (let i = 0; i < subtitles.length; i++) {
        c.fillStyle = theme.textLight;
        await fillTextWithTwemoji(c, subtitles[i], scale(8 + (26 - 16) / 2), currentY);
        currentY += scale(8 + 16);
      }
    }
    currentY += scale(8);

    // winner / against_winner / invalid

    let currentX = 0;
    const barHeight = scale(8);

    const exceededCount = result.metadata.analysis.exceeded_papers_count;
    const anchorCount = options.turnout || options.turnout_count ? result.metadata.voters.registered_count : result.official_result.votes_stats.effective_count;

    const metadataItems = [
      {key: 'abstained', value: (protocol) => protocol.metadata.voters.registered_count - protocol.official_result.turnout.count},
      {key: 'invalid', value: (protocol) => protocol.metadata.papers.invalid_count},
      {key: 'taken_home', value: (protocol) => protocol.official_result.turnout.taken_home_count},
      {key: 'lost', value: (protocol) => protocol.metadata.papers.lost_count}
    ];
    metadataItems.forEach((item) => {
      if (!item.color) {
        item.color = theme.papers[item.key] || theme.voters[item.key];
      }
    });

    const indexes = Object.keys(result.entries).sort((a, b) => {
      a = result.entries[a];
      b = result.entries[b];
      return b.official_result.votes_count - a.official_result.votes_count;
    });
    const colors = {};

    let usedOtherColorCount = 0;
    let winnerX = 0;
    const reverse = options.turnout || options.turnout_count;
    for (let i = reverse ? indexes.length - 1 : 0; reverse ? i >= 0 : i < indexes.length; i += reverse ? -1 : 1) {
      const entry = result.entries[indexes[i]];
      let color;
      if (isParty) {
        const party = electionData.parties[entry.party_id];
        color = theme.party[party.name.full];
      } else if (entry.supported_by_party_id) {
        const party = electionData.parties[entry.supported_by_party_id];
        color = theme.party[party.name.full];
        if (!color)
          throw Error(party.name.full);
      } else if (entry.supported_by_people || entry.supported_by_party_name) {
        if (entry.name === 'Лыбанева Марина Вячеславовна') {
          color = theme.party['Единая Россия'];
        } else {
          color = theme.party.other[usedOtherColorCount++];
        }
      } else {
        throw Error();
      }
      if (!color)
        throw Error(entry.name);
      const candidateId = entry.candidate_id || entry.party_id;
      colors[candidateId] = color;
      c.fillStyle = context.focus_entry_id && context.focus_entry_id !== candidateId ? color + '8A' : color;
      const count = entry.official_result.votes_count;
      const w = count / anchorCount * canvas.width;
      if (w > 0) {
        c.fillRect(currentX, currentY, w, barHeight);
        currentX += w;
      }
      if (entry.official_result.winner) {
        winnerX = currentX;
      }
    }
    if (options.turnout || options.turnout_count) {
      metadataItems.forEach((item) => {
        const count = item.value(result);
        if (count) {
          c.fillStyle = item.color + (context.focus_entry_id ? '8A' : '');
          const w = count / anchorCount * canvas.width;
          if (w > 0) {
            c.fillRect(currentX, currentY, w, barHeight);
            currentX += w;
          }
        }
      });
    }

    currentY += barHeight;

    let barWidth;
    barWidth = exceededCount / anchorCount * canvas.width;
    currentX = winnerX ? winnerX - barWidth : 0;
    if (barWidth > 0) {
      c.fillStyle = theme.voters.exceeding + (context.focus_entry_id ? '8A' : '');
      c.fillRect(Math.max(0, Math.min(currentX, canvas.width - barWidth)), currentY, barWidth, barHeight);
      currentX += barWidth;
      currentY += barHeight;
    }

    currentX = scale(8);
    currentY += scale(8);
    const radius = scale(4);

    const addInfo = async (color, name, info, opacity) => {
      c.font = font(scale(16));
      c.textAlign = 'left';

      const textWidth = measureText(c, name).width;
      const infoWidth = measureText(c, info).width;
      const takenWidth = radius + radius + scale(8) + textWidth + scale(8) + infoWidth + scale(8);
      if (currentX + takenWidth + scale(8) > canvas.width) {
        currentY += scale(16 + 8);
        currentX = scale(8);
      }

      c.fillStyle = opacity ? color + opacity : color;
      currentX += radius;
      c.beginPath();
      c.arc(currentX, currentY + scale(9), radius, 0, 2 * Math.PI, false);
      c.fill();
      currentX += radius;
      currentX += scale(8);

      c.textBaseline = 'top';
      c.fillStyle = opacity ? theme.text + opacity : theme.text;

      await fillTextWithTwemoji(c, name, currentX, currentY);
      currentX += textWidth;
      currentX += scale(8);

      c.fillStyle = opacity ? theme.textLight + opacity : theme.textLight;
      c.textAlign = 'left';
      c.textBaseline = 'top';
      await fillTextWithTwemoji(c, info, currentX, currentY);
      currentX += infoWidth;
      currentX += scale(8);

      currentX += scale(10);
    };

    const allowTotalAgainstCount = commission && commission.type === 'gik' && !topEntry.supported_by_smart_vote;

    for (let i = 0; i < indexes.length; i++) {
      const entry = result.entries[indexes[i]];
      const name = getEntryName(context, electionData, entry);
      const info = options.turnout ? toDisplayPercentage(entry.official_result.registered_percentage, true) + '%' : formatNumber(entry.official_result.votes_count);
      if ((options.turnout || options.turnout_count) && !entry.official_result.votes_count)
        continue;
      const candidateId = entry.candidate_id || entry.party_id;
      const color = colors[candidateId];
      const blurred = context.focus_entry_id && candidateId !== context.focus_entry_id;
      await addInfo(color, (entry.supported_by_smart_vote ? context.__('emoji.alias.smart') + ' ' : '') + name, info, blurred ? '8A' : null);
      /*if (needAgainst) {
        await addInfo('#000000', context.__('result.against_winner'), formatNumber(totalAgainstCount));
      }*/
    }

    if (options.turnout || options.turnout_count) {
      for (let i = 0; i < metadataItems.length; i++) {
        const item = metadataItems[i];
        const count = item.value(result);
        if (count) {
          await addInfo(item.color, context.__('result.' + item.key), options.turnout_count ? formatNumber(count) : toDisplayPercentage(count / result.metadata.voters.registered_count * 100, true) + '%', context.focus_entry_id ? 'A0' : null);
        }
      }
    }
    if (exceededCount) {
      await addInfo(theme.voters.exceeding, context.__(result.metadata.analysis.exceeded_papers_steal_winning ? 'emoji.violation.stealing' : 'emoji.violation.exceeding') + ' ' + context.__('result.exceeding'), options.turnout ? toDisplayPercentage(exceededCount / result.metadata.voters.registered_count * 100, true) + '%' : formatNumber(exceededCount), context.focus_entry_id ? 'A0' : null);
    }

    currentY += scale(16 + 4);
    currentX = 0;

    if (!empty(commissionProtocols)) {
      const drawChart = async (startX, endX, startY, endY, groupedProtocol, commissionTypes, commissionProtocols, winnerEntry, options) => {
        options = options || {};

        // Linear data

        const winnerId = winnerEntry.party_id || winnerEntry.candidate_id;
        let secondPlaceEntry = null, smartVoteEntry = null;
        for (let i = 0; i < groupedProtocol.entries.length; i++) {
          const entry = groupedProtocol.entries[i];
          if (entry.supported_by_smart_vote) {
            smartVoteEntry = entry;
          }
          if (entry.official_result.place === 2) {
            secondPlaceEntry = entry;
          }
        }
        if (!secondPlaceEntry)
          throw Error();
        const smartVoteEntryId = smartVoteEntry ? (smartVoteEntry.party_id || smartVoteEntry.candidate_id) : 0;
        const totalAgainstCount = arraySum(groupedProtocol.entries, (entry) => {
          return (entry.party_id || entry.candidate_id) !== winnerId ? entry.official_result.votes_count : 0;
        });

        const anchorCount = options.turnout ? 100 : options.turnout_count ? Object.values(groupedProtocol.official_result.turnout_stats.count.max)[0] : context.focus_entry ? findCandidate(groupedProtocol.entries, context.focus_entry_id, context.focus_entry.official_result.position).official_result.votes_count : winnerEntry.official_result.votes_count;

        const anchorCandidateEntry = winnerEntry.supported_by_smart_vote ? secondPlaceEntry : winnerEntry;
        const anchorCandidateId = anchorCandidateEntry.party_id || anchorCandidateEntry.candidate_id;

        const relatedToCommissionIds = groupedProtocol.related_to[commissionTypes];
        const commissionIds = (Array.isArray(relatedToCommissionIds) ? cloneArray(relatedToCommissionIds) : [relatedToCommissionIds]).filter((commissionId) => !!commissionProtocols[commissionId]);

        const protocolSorter = (a, b) => {
          if ((options.by_tik || options.sort_by_tik) && a.related_to.tik !== b.related_to.tik && a.protocol_scope.type === 'uik') {
            const aTik = a.protocol_scope.type === 'tik' ? a : electionData.results_by_tik[a.electoral_district.type][a.electoral_district.id ? 'person_' + a.electoral_district.id : 'parties'][a.related_to.tik];
            const bTik = b.protocol_scope.type === 'tik' ? b : electionData.results_by_tik[b.electoral_district.type][b.electoral_district.id ? 'person_' + b.electoral_district.id : 'parties'][b.related_to.tik];
            const byTik = protocolSorter(aTik, bTik);
            if (byTik) {
              return byTik;
            }
          }
          if (smartVoteEntry != null) {
            const aCandidate = findCandidate(a.entries, smartVoteEntryId, smartVoteEntry.official_result.position);
            const bCandidate = findCandidate(b.entries, smartVoteEntryId, smartVoteEntry.official_result.position);

            const aVotes = aCandidate.official_result.votes_count;
            const bVotes = bCandidate.official_result.votes_count;

            const aWeight = aVotes / a.metadata.papers.valid_count;
            const bWeight = bVotes / b.metadata.papers.valid_count;

            if (winnerId != smartVoteEntryId) {
              const aWinner = findCandidate(a.entries, winnerId, winnerEntry.official_result.position);
              const bWinner = findCandidate(b.entries, winnerId, winnerEntry.official_result.position);
              const aWinnerWeight = aWinner.official_result.votes_count / a.metadata.papers.valid_count;
              const bWinnerWeight = bWinner.official_result.votes_count / b.metadata.papers.valid_count;

              if (aWinnerWeight != bWinnerWeight) {
                return aWinnerWeight < bWinnerWeight ? -1 : 1;
              }
            }

            if (aWeight != bWeight) {
              return aWeight < bWeight ? 1 : -1;
            }
          }

          const aCandidate = findCandidate(a.entries, anchorCandidateId, anchorCandidateEntry.official_result.position);
          const bCandidate = findCandidate(b.entries, anchorCandidateId, anchorCandidateEntry.official_result.position);
          const aRate = aCandidate.official_result.votes_count / a.official_result.votes_stats.effective_count;
          const bRate = bCandidate.official_result.votes_count / b.official_result.votes_stats.effective_count;
          if (aRate != bRate) {
            return aRate < bRate ? -1 : 1;
          }

          let aTurnout = a.official_result.turnout;
          let bTurnout = b.official_result.turnout;
          if (aTurnout.valid_count != bTurnout.valid_count) {
            return aTurnout.valid_count < bTurnout.valid_count ? -1 : 1;
          }
          if (aTurnout.count != bTurnout.count) {
            return aTurnout.count < bTurnout.count ? -1 : 1;
          }
          return 0;
        };

        commissionIds.sort((aKey, bKey) => {
          const a = commissionProtocols[aKey];
          const b = commissionProtocols[bKey];
          return protocolSorter(a, b);
        });

        // Frame and background

        const horizontalSectionCount = countKeys(commissionProtocols);
        const horizontalSectionWidth = (endX - startX) / horizontalSectionCount;

        const titleMaxWidth = horizontalSectionWidth * 2 - scale(2.5);
        const titleFontSize = Math.min(scale(11), titleMaxWidth);
        const titleMargin = scale(4);
        const titleSpacing = scale(2);

        const columns = [];
        let maxTitleWidth = 0, maxTitleHeight = 0;
        let maxEvenTitleHeight = 0;
        let maxOddTitleHeight = 0;
        const explanations = {};
        if (winnerEntry.candidate_id && groupedProtocol.electoral_district.type !== 'municipality') {
          explanations[context.__('emoji.alias.smart')] = context.__('hints.smart');
        }

        const columnsByCommission = options.votes_dynamics || options.turnout || options.turnout_count;
        if (columnsByCommission) {
          for (let columnIndex = 0; columnIndex < horizontalSectionCount; columnIndex++) {
            const commissionId = commissionIds[columnIndex];
            const protocol = commissionProtocols[commissionId];
            const commission = commissionTypes === 'tik' ? electionData.gik.tiks[commissionId] : electionData.uiks[commissionId];

            const violations = electionData.violations.uik[commissionId];
            let parentAwards = null;
            let hasPendingCourt = false;
            let hasChains = false;
            if (commission.type === 'tik') {
              for (let uikId in commission.uiks) {
                if (electionData.violations.uik.pending_courts.includes(uikId)) {
                  hasPendingCourt = true;
                }
                const violations = electionData.violations.uik[uikId];
                if (violations && violations.violations.includes('chains')) {
                  hasChains = true;
                }
              }
            } else if (commission.type === 'uik') {
              hasPendingCourt = electionData.violations.uik.pending_courts.includes(commissionId);
              parentAwards = electionData.gik.tiks[commission.parent_commission.id].awards;
              const violations = electionData.violations.uik[commissionId];
              hasChains = violations && violations.violations.includes('chains');
            }

            let titles = [commissionId + ''];
            const awards = commission.awards;
            if (awards) {
              for (const awardType in awards) {
                const emoji = context.__('emoji.award.' + awardType);
                explanations[emoji] = context.__('hints.award.' + awardType);
                titles.push(emoji);
              }
            }
            if (parentAwards && !awards) {
              const emoji = context.__('emoji.award.parent');
              explanations[emoji] = context.__('hints.award.parent');
              titles.push(emoji);
            }
            if (hasPendingCourt) {
              const emoji = context.__('emoji.violation.court');
              explanations[emoji] = context.__('hints.violation.court');
              titles.push(emoji);
            }
            if (commission.violation_reports) {
              const replacements = {
                'result_override': 'count_procedure_failure'
              };
              const types = [... new Set((commission.violation_reports.during || []).concat(commission.violation_reports.finale || []))].sort().map((item) => replacements[item] || item);
              if (types.length) {
                let found = false;
                const knownViolations = [
                  'carousel_or_stuffing',
                  'registered_voters',
                  'count_procedure_failure',
                  'observer_rights_failure',
                  'pressure_on_voters',
                  'on_home'
                ];
                for (let i = 0; i < knownViolations.length; i++) {
                  const knownViolation = knownViolations[i];
                  if (types.includes(knownViolation)) {
                    const emoji = context.__('emoji.violation.' + knownViolation);
                    explanations[emoji] = context.__('hints.violation.' + knownViolation);
                    titles.push(emoji);
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  const emoji = context.__('emoji.violation.has_reports');
                  explanations[emoji] = context.__('hints.violation.has_reports');
                  titles.push(emoji);
                }
              }
            }
            if (hasChains) {
              const emoji = context.__('emoji.violation.chains');
              explanations[emoji] = context.__('hints.violation.chains');
              titles.push(emoji);
            }
            if (commission.unknown) {
              const emoji = context.__('emoji.alias.question');
              explanations[emoji] = context.__('hints.unknown_commission');
              titles.push(emoji);
            }
            const exceededCount = protocol.metadata.analysis.exceeded_papers_count;
            let hasExceedingVotes = exceededCount > 0;
            let hasStealing = protocol.metadata.analysis.exceeded_papers_steal_winning > 0;
            let isInvalid = protocol.protocol_scope.type === 'uik' && protocol.metadata.analysis.invalid_protocol_count;
            let needRedHighlight = false;
            if (isInvalid || hasStealing) {
              const key = isInvalid ? 'violation.invalid' : hasStealing ? 'violation.stealing' : 'violation.' + violations.violations[0];
              const emoji = context.__('emoji.' + key);
              const info = context.__('hints.' + key);
              if (explanations[emoji] && explanations[emoji] !== info)
                throw Error();
              explanations[emoji] = info;
              titles.push(emoji);
              needRedHighlight = true;
            } else if (hasExceedingVotes) {
              const emoji = context.__('emoji.violation.exceeding');
              explanations[emoji] = context.__('hints.violation.exceeding');
              titles.push(emoji);
            }

            const address = electionData.addresses[commission.address_id || commission.voting_address_id];
            if (address && address.abroad) {
              const emoji = context.__('emoji.address.country.' + address.address.country);
              explanations[emoji] = context.__('hints.abroad.' + address.type + '.' + address.address.country);
              titles.push(emoji);
            }

            let fillStyle = null;
            const isOtherCommission = highlightCommissionId && highlightCommissionId !== commissionId && otherCommissionIds && otherCommissionIds.includes(commissionId);
            let highlightLevel = highlightCommissionId ? (highlightCommissionId === commissionId ? 1.0 : isOtherCommission ? 0.25 : 0.15) : 1.0;

            if (highlightLevel === 1.0) {
              if (options.votes_dynamics && (needRedHighlight || hasPendingCourt)) {
                const redAlpha = ((hasPendingCourt ? 0x27 : 0x10) * (highlightLevel)) / 255;
                fillStyle = 'rgba(255, 0, 0, ' + redAlpha + ')';
              } else if (highlightCommissionId === commissionId) {
                fillStyle = theme.highlight;
              }
            }

            let textStyle = null;
            if (highlightCommissionId) {
              textStyle = highlightCommissionId === commissionId || isOtherCommission ? theme.textLight : theme.textLight + '6a';
            }

            c.font = font(titleFontSize);
            titles = titles.map((title) => {
              const width = measureText(c, title).width;
              return {
                text: title,
                width: width,
                height: (width <= titleMaxWidth ? titleFontSize : titleFontSize * (titleMaxWidth / width))
              };
            });

            const totalTitleHeight = arraySum(titles, (item, index) => item.height + (index ? titleSpacing : 0));
            maxTitleWidth = Math.max(maxTitleWidth, arrayMax(titles, (item) => item.width));
            maxTitleHeight = Math.max(maxTitleHeight, totalTitleHeight);
            if (columnIndex % 2 === 0) {
              maxOddTitleHeight = Math.max(maxOddTitleHeight, totalTitleHeight);
            } else {
              maxEvenTitleHeight = Math.max(maxEvenTitleHeight, totalTitleHeight);
            }

            columns.push({
              titles,
              fillStyle,
              textStyle
            });
          }
        }

        c.strokeStyle = theme.separator;

        const needTableTitles = columns.length && horizontalSectionWidth >= scale(5);
        const needSplitEvenOddTitle = maxTitleWidth > horizontalSectionWidth - scale(2.5);
        if (needTableTitles) {
          if (needSplitEvenOddTitle) {
            startY += maxOddTitleHeight + titleMargin;
            endY -= maxEvenTitleHeight + titleMargin;
          } else {
            startY += maxTitleHeight + titleMargin;
          }
          if (!empty(explanations)) {
            c.fillStyle = theme.text;
            const hintSize = scale(10);
            c.font = font(hintSize);

            const hints = [];
            const padding = scale(8);
            const itemSpacing = scale(10);
            let lineWidth = 0;
            let lineCount = 1;
            const maxWidth = canvas.width - padding * 2;
            const lineHeight = hintSize + scale(4);
            let blockHeight = padding * 2 + hintSize;

            for (const emoji in explanations) {
              if (!explanations.hasOwnProperty(emoji)) {
                continue;
              }
              const text = emoji + ' ' + explanations[emoji];
              const width = measureText(c, text).width;
              hints.push({text, width});
            }
            hints.sort((a, b) => a.width - b.width);
            for (let i = 0; i < hints.length; i++) {
              const hint = hints[i];
              if (lineWidth + hint.width > maxWidth) {
                lineWidth = 0;
                lineCount++;
                blockHeight += lineHeight;
              }
              lineWidth += hint.width + itemSpacing;
            }

            c.fillStyle = theme.background;
            c.fillRect(0, canvas.height - blockHeight, canvas.width, blockHeight);
            c.strokeStyle = theme.separator;
            c.beginPath();
            c.moveTo(0, canvas.height - blockHeight);
            c.lineTo(canvas.width, canvas.height - blockHeight);
            c.lineWidth = scale(1);
            c.stroke();

            c.fillStyle = theme.backgroundText;
            let cx = padding;
            let cy = canvas.height - blockHeight + padding;
            for (let hintIndex = 0; hintIndex < hints.length; hintIndex++) {
              const hint = hints[hintIndex];

              if (cx + hint.width > canvas.width - padding) {
                cx = padding;
                cy += lineHeight;
              }

              await fillTextWithTwemoji(c, hint.text, cx, cy);
              cx += hint.width + itemSpacing;
            }

            endY -= blockHeight;
          }
        }

        const cornerRadius = scale(3);
        const frame = new Path2D();
        const frameBounds = {left: startX, top: startY, right: endX, bottom: endY, anchorValue: options.turnout ? anchorCount + '%' : context.__n(options.turnout_count ? 'chart.paper_count' : 'chart.votes_count', anchorCount), hasColumns: needTableTitles, columnsDoNotFit: columns.length && !needTableTitles};
        frame.moveTo(startX + cornerRadius, startY);
        frame.lineTo(endX - cornerRadius, startY);
        frame.quadraticCurveTo(endX, startY, endX, startY + cornerRadius);
        frame.lineTo(endX, endY - cornerRadius);
        frame.quadraticCurveTo(endX, endY, endX - cornerRadius, endY);
        frame.lineTo(startX + cornerRadius, endY);
        frame.quadraticCurveTo(startX, endY, startX, endY - cornerRadius);
        frame.lineTo(startX, startY + cornerRadius);
        frame.quadraticCurveTo(startX, startY, startX + cornerRadius, startY);
        frame.closePath();
        c.stroke(frame);

        /*const verticalSectionCount = 10;
        const verticalSectionHeight = (endY - startY) / verticalSectionCount;
        for (let i = 1; i < verticalSectionCount; i++) {
          c.beginPath();
          c.moveTo(startX, startY + verticalSectionHeight * i);
          c.lineTo(endX, startY + verticalSectionHeight * i);
          c.stroke();
        }*/

        if (needTableTitles) {
          for (let i = 1; i < horizontalSectionCount; i++) {
            const column = columns[i - 1];
            c.strokeStyle = column.strokeStyle || (options.turnout ? theme.separator + 'A0' : theme.separator);
            c.beginPath();
            c.moveTo(startX + horizontalSectionWidth * i, startY);
            c.lineTo(startX + horizontalSectionWidth * i, endY);
            c.stroke();
          }
        }

        for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
          const left = startX + horizontalSectionWidth * columnIndex;
          const cx = left + horizontalSectionWidth / 2;
          const column = columns[columnIndex];

          const commissionId = commissionIds[columnIndex];

          if (column.fillStyle) {
            c.fillStyle = column.fillStyle;
            c.fillRect(left, startY, horizontalSectionWidth, endY - startY);
          }

          if (needTableTitles) {
            const onTop = columnIndex % 2 === 0 || !needSplitEvenOddTitle;

            let cy;
            c.beginPath();
            c.strokeStyle = (highlightCommissionId && highlightCommissionId !== commissionId) ? theme.textLight + 'A0' : theme.textLight;
            if (onTop) {
              c.textBaseline = 'bottom';
              c.moveTo(cx, cy = startY - titleMargin);
              c.lineTo(cx, startY);
            } else {
              c.textBaseline = 'top';
              c.moveTo(cx, endY);
              c.lineTo(cx, cy = endY + titleMargin);
            }
            c.stroke();

            c.font = font(titleFontSize);
            c.textAlign = 'center';

            for (let titleIndex = 0; titleIndex < column.titles.length; titleIndex++) {
              const title = column.titles[titleIndex];
              const textWidth = title.width;
              c.fillStyle = column.textStyle || theme.textLight;
              let scale = 1;
              if (textWidth > titleMaxWidth) {
                scale = titleMaxWidth / textWidth;
                c.save();
                c.translate(cx, cy);
                c.scale(scale, scale);
                await fillTextWithTwemoji(c, title.text, 0, 0);
                c.restore();
              } else {
                await fillTextWithTwemoji(c, title.text, cx, cy);
              }
              const hintKey = onTop ? 'topHint' : 'bottomHint';
              const existingHint = frameBounds[hintKey];
              const hint = {cx, cy, size: titleFontSize, scale};
              if (!existingHint) {
                frameBounds[hintKey] = hint;
              }

              cy += (titleFontSize * scale + titleSpacing) * (onTop ? -1 : 1);
            }
          }
        }

        const dot = new Path2D();
        dot.arc(0, 0, Math.max(1, scale(0.5)), 0, 2 * Math.PI);
        dot.closePath();

        c.save();
        c.clip(frame);

        if (options.votes_dynamics) {
          const drawVector = (color, protocolTransformer) => {
            let votesSum = 0;
            let needLineDash = false;

            let cx = startX;
            c.beginPath();
            c.strokeStyle = color;
            c.lineWidth = scale(1.5);
            let cy = endY;
            c.moveTo(cx, cy);

            for (let commissionIndex = 0; commissionIndex < commissionIds.length; commissionIndex++) {
              const commissionId = commissionIds[commissionIndex];
              const protocol = commissionProtocols[commissionId];
              const info = protocolTransformer(protocol);
              const votesCount = info.votesCount;
              const isEmpty = info.isEmpty;
              let totalIrrelevantVotesCount = 0;

              const style = highlightCommissionId ? (commissionId === highlightCommissionId ? color : color + '6a') : color;
              if (c.strokeStyle !== style || needLineDash != isEmpty) {
                c.stroke();
                c.strokeStyle = style;
                if (needLineDash != isEmpty) {
                  needLineDash = isEmpty;
                  c.setLineDash(isEmpty ? [Math.max(scale(3), Math.min(scale(9), horizontalSectionWidth / 4.5))] : []);
                  c.lineDashMarker = isEmpty ? dot : null;
                }
                c.beginPath();
                c.moveTo(cx, cy);
              }

              const finalCx = cx + horizontalSectionWidth;
              let isPrecise = false;

              if (protocol.protocol_scope.type === 'tik' && protocol.metadata.analysis.protocol_count > 1) {
                isPrecise = true;
                let uikProtocols = protocol.related_to.uik.map((uikId) => {
                  const key = protocol.electoral_district.municipality ? protocol.electoral_district.municipality + '_' + protocol.electoral_district.id : protocol.electoral_district.id ? 'person_' + protocol.electoral_district.id : 'parties';
                  return electionData.results_by_uik[uikId][protocol.electoral_district.type][key];
                }).filter((protocol) => !protocol.empty).sort(protocolSorter);
                const dxPerProtocol = horizontalSectionWidth / uikProtocols.length;
                let uikVotesSum = 0;
                let irrelevantVotesCount = 0;
                for (let i = 0; i < uikProtocols.length; i++) {
                  const uikProtocol = uikProtocols[i];
                  const uikInfo = protocolTransformer(uikProtocol);
                  if (context.district && uikProtocol.related_to.district !== context.district) {
                    irrelevantVotesCount += uikInfo.votesCount;
                    continue;
                  }
                  cx += dxPerProtocol;
                  uikVotesSum += uikInfo.votesCount;
                  cy = endY - (votesSum + uikVotesSum) / anchorCount * (endY - startY);
                  c.lineTo(cx, cy);
                }
                if (uikVotesSum + irrelevantVotesCount != votesCount) {
                  throw Error('Missing votes: ' + ((votesSum + votesCount) - uikVotesSum));
                }
                votesSum += uikVotesSum;
              } else {
                votesSum += votesCount;
              }
              const finalCy = endY - votesSum / anchorCount * (endY - startY);
              if (cx !== finalCx || cy !== finalCy) {
                cx = finalCx;
                cy = finalCy;
                c.lineTo(cx, cy);
              }
            }
            c.stroke();
            if (needLineDash) {
              needLineDash = false;
              c.setLineDash([]);
              c.lineDashMarker = null;
            }
          };

          if (totalAgainstCount <= anchorCount && options.allowTotalAgainstCount) {
            drawVector('#000000', (protocol) => {
              const uikEntry = findCandidate(protocol.entries, anchorCandidateId, anchorCandidateEntry.official_result.position);
              const votesCount = protocol.metadata.papers.valid_count - uikEntry.official_result.votes_count;
              const isEmpty = votesCount / protocol.metadata.papers.valid_count <= 0.015 * (protocol.entries.length - 1);
              return {votesCount, isEmpty};
            });
          }

          for (let entryIndex = 0; entryIndex < groupedProtocol.entries.length; entryIndex++) {
            const entry = groupedProtocol.entries[entryIndex];
            const candidateId = entry.party_id || entry.candidate_id;
            const color = colors[candidateId];

            drawVector(context.focus_entry_id && context.focus_entry_id !== candidateId ? color + '4E' : color, (protocol) => {
              const uikEntry = findCandidate(protocol.entries, candidateId, entry.official_result.position);
              const votesCount = uikEntry.official_result.votes_count;
              const isEmpty = !(/*commissionTypes === 'tik' && */context.focus_entry_id && context.focus_entry_id === candidateId) && uikEntry.official_result.votes_count / protocol.metadata.papers.valid_count <= 0.015;
              return {votesCount, isEmpty};
            });
          }
        } else if (options.turnout || options.turnout_count) {
          const candidateId = context.focus_entry ? (context.focus_entry.party_id || context.focus_entry.candidate_id) : 0;
          const color = candidateId ? colors[candidateId] : 0;
          currentX = startX;
          const measureBarHeight = (protocol, count) => {
            return options.turnout_count ? count / anchorCount : count / protocol.metadata.voters.registered_count;
          };
          const measureEntryBarHeight = (protocol, entry) => {
            return measureBarHeight(protocol, entry.official_result.votes_count);
          };
          for (let commissionIndex = 0; commissionIndex < commissionIds.length; commissionIndex++) {
            const commissionId = commissionIds[commissionIndex];
            const protocol = commissionProtocols[commissionId];
            c.fillStyle = highlightCommissionId && highlightCommissionId !== commissionId ? color + '6a' : color;
            if (protocol.protocol_scope.type !== 'uik' && protocol.metadata.analysis.protocol_count > 1) {
              let uikProtocols = protocol.related_to.uik.map((uikId) => {
                const key = protocol.electoral_district.municipality ? protocol.electoral_district.municipality + '_' + protocol.electoral_district.id : protocol.electoral_district.id ? 'person_' + protocol.electoral_district.id : 'parties';
                return electionData.results_by_uik[uikId][protocol.electoral_district.type][key];
              }).filter((protocol) => !protocol.empty && (!context.district || protocol.related_to.district === context.district)).sort(protocolSorter);
              const dxPerProtocol = horizontalSectionWidth / uikProtocols.length;
              const finalCx = currentX + horizontalSectionWidth;
              if (context.focus_entry) {
                c.beginPath();
                c.moveTo(currentX, endY);
                uikProtocols.forEach((protocol, index) => {
                  const thisEntry = findCandidate(protocol.entries, candidateId, context.focus_entry.official_result.position);
                  const height = (endY - startY) * measureEntryBarHeight(protocol, thisEntry);
                  c.lineTo(currentX, endY - height);
                  currentX += dxPerProtocol;
                  c.lineTo(currentX, endY - height);
                });
                c.lineTo(currentX, endY);
                c.fill();
              } else {
                const heights = new Array(uikProtocols.length).fill(0);
                const startCx = currentX;
                for (let i = groupedProtocol.entries.length - 1; i >= 0; i--) {
                  const groupedEntry = groupedProtocol.entries[i];
                  const candidateId = groupedEntry.party_id || groupedEntry.candidate_id;
                  const color = colors[candidateId];
                  c.fillStyle = highlightCommissionId && highlightCommissionId !== commissionId ? color + '6a' : color;
                  c.beginPath();
                  uikProtocols.forEach((protocol, index) => {
                    const thisEntry = findCandidate(protocol.entries, candidateId, groupedEntry.official_result.position);
                    const height = (endY - startY) * measureEntryBarHeight(protocol, thisEntry);
                    if (height) {
                      c.rect(currentX, endY - heights[index] - height, dxPerProtocol, height);
                      heights[index] += height;
                    }
                    currentX += dxPerProtocol;
                  });
                  c.fill();
                  currentX = startCx;
                }
                metadataItems.filter((item) => item.key !== 'abstained').forEach((item) => {
                  c.fillStyle = highlightCommissionId && highlightCommissionId !== commissionId ? item.color + '6a' : item.color;
                  c.beginPath();
                  uikProtocols.forEach((protocol, index) => {
                    const count = item.value(protocol);
                    if (count) {
                      const height = (endY - startY) * measureBarHeight(protocol, count);
                      if (height) {
                        c.rect(currentX, endY - heights[index] - height, dxPerProtocol, height);
                        heights[index] += height;
                      }
                    }
                    currentX += dxPerProtocol;
                  });
                  c.fill();
                  currentX = startCx;
                });
              }
              currentX = finalCx;
            } else {
              if (context.focus_entry) {
                const color = colors[candidateId];
                c.fillStyle = highlightCommissionId && highlightCommissionId !== commissionId ? color + '6a' : color;
                const thisEntry = findCandidate(protocol.entries, candidateId, context.focus_entry.official_result.position);
                const height = (endY - startY) * measureEntryBarHeight(protocol, thisEntry);
                c.fillRect(currentX, endY - height, horizontalSectionWidth, height);
              } else if (context.focus_entry_id < 0 && (-context.focus_entry_id - 1) < metadataItems.length) {
                const item = metadataItems[(-context.focus_entry_id - 1)];
                const count = item.value(protocol);
                c.fillStyle = highlightCommissionId && highlightCommissionId !== commissionId ? item.color + '6a' : item.color;
                const height = (endY - startY) * measureBarHeight(protocol, count);
                c.fillRect(currentX, endY - cy - height, horizontalSectionWidth, height);
              } else {
                let cy = 0;
                for (let i = groupedProtocol.entries.length - 1; i >= 0; i--) {
                  const groupedEntry = groupedProtocol.entries[i];
                  const candidateId = groupedEntry.party_id || groupedEntry.candidate_id;
                  const entry = findCandidate(protocol.entries, candidateId, groupedEntry.official_result.position);
                  const height = (endY - startY) * (measureEntryBarHeight(protocol, entry));
                  if (height <= 0)
                    continue;
                  const color = colors[candidateId];
                  c.fillStyle = highlightCommissionId && highlightCommissionId !== commissionId ? color + '6a' : color;
                  c.fillRect(currentX, endY - cy - height, horizontalSectionWidth, height);
                  cy += height;
                }
                metadataItems.filter((item) => item.key !== 'abstained').forEach((item) => {
                  const count = item.value(protocol);
                  if (count) {
                    c.fillStyle = highlightCommissionId && highlightCommissionId !== commissionId ? item.color + '6a' : item.color;
                    const height = (endY - startY) * measureBarHeight(protocol, count);
                    c.fillRect(currentX, endY - cy - height, horizontalSectionWidth, height);
                    cy += height;
                  }
                });
              }
              currentX += horizontalSectionWidth;
            }
          }
        } else if (options.comet) {
          const dot = new Path2D();
          const dotRadius = Math.max(1, scale(2));
          dot.arc(0, 0, dotRadius, 0, 2 * Math.PI);
          dot.closePath();

          let maxTurnoutPercentage = 0;
          let maxValidPercentage = 0;

          for (let commissionIndex = 0; commissionIndex < commissionIds.length; commissionIndex++) {
            const commissionId = commissionIds[commissionIndex];
            const protocol = commissionProtocols[commissionId];
            maxTurnoutPercentage = Math.max(maxTurnoutPercentage, protocol.official_result.turnout.valid_percentage);
            for (let entryIndex = 0; entryIndex < protocol.entries.length; entryIndex++) {
              maxValidPercentage = Math.max(maxValidPercentage, protocol.entries[entryIndex].official_result.valid_percentage);
            }
          }

          for (let i = groupedProtocol.entries.length - 1; i >= 0; i--) {
            const groupedEntry = groupedProtocol.entries[i];
            const candidateId = groupedEntry.party_id || groupedEntry.candidate_id;
            const color = colors[candidateId];
            c.fillStyle = color;
            for (let commissionIndex = 0; commissionIndex < commissionIds.length; commissionIndex++) {
              const commissionId = commissionIds[commissionIndex];
              const protocol = commissionProtocols[commissionId];
              const entry = findCandidate(protocol.entries, candidateId, groupedEntry.official_result.position);

              const validPercentage = entry.official_result.valid_percentage;
              const turnoutPercentage = protocol.official_result.turnout.valid_percentage;

              const x = frameBounds.left + (frameBounds.right - frameBounds.left) * (turnoutPercentage / maxTurnoutPercentage);
              const y = frameBounds.bottom - (frameBounds.bottom - frameBounds.top) * (validPercentage / maxValidPercentage);

              c.save();
              c.translate(x - dotRadius, y - dotRadius);
              c.fill(dot);
              c.restore();
            }
          }
        }

        c.restore();
        return frameBounds;
      };

      const chartX = scale(8) + scale(10);
      const chartEndX = canvas.width - scale(8) - scale(10);
      const chartStartY = currentY + scale(4);
      const chartEndY = canvas.height - scale(6);

      options = Object.assign(options || {}, {allowTotalAgainstCount});

      const frame = await drawChart(chartX, chartEndX, chartStartY, chartEndY, displayResult, commissionTypes, commissionProtocols, topEntry, options);

      let verticalAxisKey;
      ['turnout', 'turnout_count', 'votes_dynamics', 'comet'].forEach((key) => {
        if (options[key]) {
          verticalAxisKey = key;
        }
      });
      if (!verticalAxisKey) {
        throw Error();
      }
      const verticalAxis = context.__('chart.' + verticalAxisKey + (frame.columnsDoNotFit ? '_big' : '') + '.' + commissionTypes);

      const chartCenterY = frame.top + (frame.bottom - frame.top) / 2;
      c.fillStyle = theme.textLight;
      c.font = font(scale(10), 'monospace');
      c.textBaseline = 'bottom';
      c.textAlign = 'center';
      const verticalAxisWidth = measureText(c, verticalAxis).width;
      const axisScale = Math.min(1, (frame.bottom - frame.top) / verticalAxisWidth);
      c.save();
      c.translate(chartX - scale(4), chartCenterY);
      c.rotate(-90 * Math.PI / 180);
      if (axisScale != 1) {
        c.scale(axisScale, axisScale);
      }
      await fillTextWithTwemoji(c, verticalAxis, 0, 0);
      c.restore();

      c.save();
      c.translate(chartEndX + scale(4), frame.top);
      c.textAlign = 'left';
      c.rotate(90 * Math.PI / 180);
      await fillTextWithTwemoji(c, frame.anchorValue, 0, 0);
      c.translate(frame.bottom - frame.top, 0);
      c.textAlign = 'right';
      await fillTextWithTwemoji(c, '0', 0, 0);
      c.restore();
    }

    // Send!

    // canvas.height = currentY;

    const graphCacheKey = context.cache_key_suffix ? 'graph_cache_' + context.cache_key_suffix : null;

    console.log('Graph ', graphCacheKey, ' built in', (Date.now() - startTime) / 1000.0, 'seconds. Uploading...');

    const saveStartTime = Date.now();
    const jpg = await canvas.jpg;

    let message;
    if (options.edit_message) {
      try {
        const target = clone(context.edit_message_target);
        Object.assign(target, {
          reply_markup: {inline_keyboard}
        });
        message = await editMessageMedia(bot, {type: 'photo', media: jpg, parse_mode: 'HTML'}, target);
        context.toast = context.__('toast.chart_updated');
      } catch (e) {
        console.log('Cannot update message', e);
      }
    }

    if (graphCallback) {
      await graphCallback(result, jpg, !!options.turnout);
      return;
    }

    if (!message) {
      message = await bot.sendPhoto(origin.chat.id, jpg, {
        parse_mode: 'HTML',
        reply_markup: {inline_keyboard}
      });
    }
    if (graphCacheKey && message && message.photo) {
      const sizes = message.photo;
      sizes.sort((a, b) => {
        const aSize = a.width * a.height;
        const bSize = b.width * b.height;
        return aSize !== bSize ? (aSize < bSize ? -1 : 1) : 0;
      })
      const maxSize = sizes[sizes.length - 1];
      Object.assign(maxSize, {version: CHARTS_VERSION});
      await db.put(graphCacheKey, maxSize, {valueEncoding: 'json'});
      console.log('Graph', '"' + graphCacheKey + '"', 'uploaded and saved in', (Date.now() - saveStartTime) / 1000.0, 'seconds.');
    }
  };

  const userPrograms = {
    '/start': {
      // description: 'Sends welcome message',
      run: async (context, origin, electionData) => {
        if (context.args) {
          await context.switchLanguage(context.args);
        }
        const municipalityStats = electionData.gik.stats.electoral_districts_count.municipality;
        const municipality_list = Object.keys(municipalityStats)
          .sort((a, b) => municipalityStats[b] - municipalityStats[a])
          .map((municipality) => {
            const info_url = context.__('url.info.municipality.' + municipality);
            return context.__('welcome.municipality', {municipality, municipality_latin: cyrillicToLatin(municipality), info_url});
          })
          .join(context.__('welcome.municipality_separator'));
        const params = {
          user_name: origin.from.first_name,
          municipality_list
        };

        for (const electionType in electionData.gik.stats.parties_count) {
          if (!electionData.gik.stats.parties_count.hasOwnProperty(electionType))
            continue;
          const count = electionData.gik.stats.parties_count[electionType];
          const key = 'parties_' + electionType;
          params[key] = context.__n('welcome.' + key, count);
        }
        for (const electionType in electionData.gik.stats.electoral_districts_count) {
          if (!electionData.gik.stats.electoral_districts_count.hasOwnProperty(electionType))
            continue;
          const count = electionData.gik.stats.electoral_districts_count[electionType];
          const key = 'deputies_' + electionType;
          if (typeof count === 'number') {
            params[electionType + '_info_url'] = context.__('url.info.' + electionType);
            params[key] = context.__n('welcome.' + key, count * getWinnerCount(electionType), {info_url: context.__('url.info.' + electionType)});
          } else {
            const municipalities = Object.keys(count)
              .sort((a, b) => count[b] - count[a])
              .map((id) => {
                const subParams = {
                  info_url: context.__('url.info.' + electionType + '.' + id)
                };
                subParams[electionType] = id;
                return context.__n('welcome.deputies_' + electionType, count[id] * getWinnerCount(electionType), subParams);
              });
            params['municipalities'] = context.__n('welcome.municipalities', municipalities.length);
            params[key] = municipalities.join('\n• ');
          }
        }

        ['turnout_protocol_count', 'protocol_count', 'uik_count', 'tik_count', 'district_count'].forEach((key) => {
          const count = electionData.gik.stats[key];
          params[key] = context.__n('welcome.' + key.replace(/_count$/, 's'), count);
        });

        params.member_count = context.__n('welcome.members', electionData.gik.stats.all_members.total_count);
        params.relatives_report = context.__('emoji.relatives.family') + ' ' + context.__('welcome.commissions_with_relatives.format', {
          relatives_count: context.__n('welcome.commissions_with_relatives.relatives', electionData.gik.stats.all_members.relative_guesses.members_with_guesses),
          commissions_count: context.__n('welcome.commissions_with_relatives.commissions', electionData.gik.stats.all_members.relative_guesses.commissions.total_count)
        });
        params.violations_count = context.__n('welcome.violation_reports', electionData.gik.stats.total_violation_reports_count, {url: VIOLATIONS_URL});

        const text = context.__('welcome.message', params);
        const inline_keyboard = [];

        const otherLocales = i18n.getLocales().filter((locale) => locale !== context.activeLocale);
        otherLocales.forEach((locale) => {
          inline_keyboard.push([{
            text: context.__('switch_language.' + locale),
            callback_data: '/start ' + locale
          }]);
        });

        ['city', 'federal', 'municipality'].forEach((districtType) => {
          const results = electionData.results_by_gik[districtType];
          if (results) {
            if (districtType === 'municipality') {
              const municipalities = [... new Set(Object.keys(results).map((key) => key.replace(/^person_(.+)_\d+/gi, '$1')))];
              municipalities.forEach((municipality) => {
                inline_keyboard.push([{
                  text: context.__('emoji.alias.list.' + districtType) + ' ' + context.__('select.list.' + districtType, {municipality, municipality_latin: cyrillicToLatin(municipality)}),
                  callback_data: '/list ' + districtType + ' ' + municipality
                }]);
              });
            } else {
              inline_keyboard.push([{
                text: context.__('emoji.alias.list.' + districtType) + ' ' + context.__('select.list.' + districtType),
                callback_data: '/list ' + districtType
              }]);
            }
          }
        });
        inline_keyboard.push([{
          text: context.__('emoji.alias.district') + ' ' + context.__('select.list.district'),
          callback_data: '/districts'
        }]);
        inline_keyboard.push([{
          text: context.__('emoji.alias.gik') + ' ' + context.__('select.gik.alias', {id: electionData.gik.id, id_latin: cyrillicToLatin(electionData.gik.id)}),
          callback_data: '/commission gik_' + electionData.gik.id
        }]);
        if (context.edit_message_target) {
          await bot.editMessageText(text, Object.assign(clone(context.edit_message_target), {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {inline_keyboard}
          }));
          context.toast = context.__('language_switched');
        } else {
          await bot.sendMessage(origin.chat.id, text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {inline_keyboard}
          });
        }
      }
    },

    '/list': {
      validate: (context, origin, electionData) => {
        if (electionData.results_by_gik[context.args]) {
          context.electoral_district_type = context.args;
          return true;
        } else if (context.args.startsWith('municipality ')) {
          const municipality = context.args.substring('municipality '.length);
          context.electoral_district_type = 'municipality';
          context.municipality = municipality;
          return true;
        }
        return false;
      },
      run: async (context, origin, electionData) => {
        const electoralDistrictType = context.electoral_district_type;
        const municipality = context.municipality;

        let text = '';
        const inline_keyboard = [];

        const url = context.__('url.info.' + electoralDistrictType + (municipality ? '.' + municipality : ''));

        text += '<b>';
        text += context.__('election.' + electoralDistrictType, {
          info_url: url,
          municipality
        });
        text += '</b>';

        const data = electionData.results_by_gik[electoralDistrictType];
        let keys = Object.keys(data);
        if (municipality) {
          keys = keys.filter((key) => key.startsWith('person_' + municipality));
        }

        text += '\n\n';
        text += keys.sort((a, b) => {
          const aParty = a === 'parties';
          const bParty = b === 'parties';
          if (aParty !== bParty)
            return aParty ? 1 : -1;
          const aId = parseInt(a.match(/\d+$/)[0]);
          const bId = parseInt(b.match(/\d+$/)[0]);
          return aId - bId;
        }).map((key) => {
          const protocol = data[key][electionData.gik.id];
          const isMunicipality = protocol.electoral_district.type === 'municipality';

          let text = '<b>';
          if (protocol.electoral_district.id) {
            text += context.__(isMunicipality ? 'emoji.alias.people' : 'emoji.alias.person') + ' ' + context.__('electoral_district.' + (isMunicipality ? 'multiple' : 'single') + '.one', {id: protocol.electoral_district.id});
          } else {
            text += context.__('emoji.alias.people') + ' ' + context.__('electoral_district.parties', {info_url: context.__('url.info.parties.' + protocol.electoral_district.type)});
          }
          text += '</b>';
          text += '\n';
          text += context.__('turnout') + ': ' + toDisplayPercentage(protocol.official_result.turnout.valid_percentage) + '%';

          let row;
          if (inline_keyboard.length && inline_keyboard[inline_keyboard.length - 1].length < 2) {
            row = inline_keyboard[inline_keyboard.length - 1];
          } else {
            row = [];
            inline_keyboard.push(row);
          }
          row.push(newResultButton(context, protocol));

          return text;
        }).join('\n\n');

        await sendMessage(bot, origin.chat.id, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {inline_keyboard}
        });
      }
    },

    '/districts': {
      run: async (context, origin, electionData) => {
        const districts = electionData.gik.districts;
        const inline_keyboard = [];
        let text = districts.sort((a, b) => {
          a = electionData.districts[a];
          b = electionData.districts[b];

          const aCount = Array.isArray(a.related_to.uik) ? a.related_to.uik.length : 1;
          const bCount = Array.isArray(b.related_to.uik) ? b.related_to.uik.length : 1;

          return aCount - bCount;
        }).map((district) => {
          const index = (districts.indexOf(district) + 1);
          const urlKey = 'url.district.' + shortenDistrict(district);
          const url = context.__(urlKey);
          let text = index + '. <b>' + (url !== urlKey ? '<a href="' + url + '">' + districtName(context, district) + '</a>' : districtName(context, district)) + '</b>';

          let row;
          if (inline_keyboard.length && inline_keyboard[inline_keyboard.length - 1].length < 2) {
            row = inline_keyboard[inline_keyboard.length - 1];
          } else {
            row = [];
            inline_keyboard.push(row);
          }
          row.push({
            text: context.__('emoji.alias.district') + ' ' + districtName(context, district),
            callback_data: '/d ' + shortenDistrict(district)
          });

          const districtInfo = electionData.districts[district];
          let tikIds = Array.isArray(districtInfo.related_to.tik) ? districtInfo.related_to.tik.map(id => '№' + id).join(', ') : '№' + districtInfo.related_to.tik;
          text += '\n• ';
          text += context.__('commission.tik') + ' ' + tikIds;
          text += '\n• ';
          text += context.__n('commission.xUiks', Array.isArray(districtInfo.related_to.uik) ? districtInfo.related_to.uik.length : 1);

          /* for (const districtType in districtInfo.electoral_districts) {
            if (!districtInfo.electoral_districts.hasOwnProperty(districtType))
              continue;
            let ids = districtInfo.electoral_districts[districtType];
            ids = (Array.isArray(ids) ? ids : [ids]).filter((id) => id !== 'parties');
            text += '\n';
            const municipality = districtType === 'municipality' ? ids[0].split('_')[0] : null;
            if (municipality) {
              ids = ids.map((id) => parseInt(id.substring(municipality.length + 1)));
            }
            ids = ids.sort((a, b) => a - b);
            if (municipality) {
              const infoUrl = context.__('url.info.' + districtType + '.' + municipality);
              text += context.__('electoral_district.' + districtType, {info_url: infoUrl, municipality});
            } else {
              const infoUrl = context.__('url.info.' + districtType);
              text += context.__('electoral_district.' + districtType, {info_url: infoUrl});
            }
            text += ': ';
            if (ids.length > 1  && ids[ids.length - 1] - ids[0] === ids.length - 1) {
              text += '<code>№' + ids[0] + '–' + ids[ids.length - 1] + '</code>';
            } else {
              text += ids.map((item) => '<code>№' + item + '</code>').join(', ')
            }
          }*/
          return text;
        }).join('\n\n');


        await sendMessage(bot, origin.chat.id, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {inline_keyboard}
        });
      }
    },

    '/district': {
      suffixPattern: /_?([а-яА-Я]+)/,
      validate: (context, origin, electionData) => {
        if (!context.args)
          return false;
        const district = shortenDistrict(context.args);
        const info = electionData.districts[unshortenDistrict(district)] || electionData.districts[district];
        if (info) {
          context.district = info;
          return true;
        }
        return false;
      },
      run: async (context, origin, electionData) => {
        const district = context.district;
        const inline_keyboard = [];

        let text = context.__('emoji.alias.district') + ' <b>' + district.name + '</b>';

        const allProtocols = [];

        for (const electoralDistrictType in district.electoral_districts) {
          if (!district.electoral_districts.hasOwnProperty(electoralDistrictType)) {
            continue;
          }

          let ids = district.electoral_districts[electoralDistrictType];
          if (!Array.isArray(ids)) {
            ids = [ids];
          }
          ids.forEach((id) => {
            let protocols = electionData.results_by_district[electoralDistrictType];
            protocols = protocols[id] || protocols['person_' + id];
            const protocol = protocols[district.name];
            allProtocols.push(protocol);
          });
        }

        const review = buildProtocolsReview(context, electionData, allProtocols);
        if (review) {
          text += '\n\n' + review.text;
          inline_keyboard.push(...review.inline_keyboard);
        }

        await sendMessage(bot, origin.chat.id, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {inline_keyboard}
        });
      }
    },

    '/select': {
      suffixPattern: /_?([0-9]+)/,
      validate: (context, origin, electionData) => {
        if (!context.id && !context.commission_id) {
          const id = parseInt(context.args);
          if (id) {
            context.id = id;
          }
        }
        const id = context.id || context.commission_id;
        return id && typeof id === 'number';
      },
      run: async (context, origin, electionData) => {
        const result = [];
        const id = context.id || context.commission_id;
        let onlyCommissions = true;

        if (context.id) {
          Object.keys(electionData.results_by_gik)
            .forEach((electoralDistrictType) => {
              const electoralDistrictResults = electionData.results_by_gik[electoralDistrictType];
              Object.keys(electoralDistrictResults).forEach((electoralDistrictId) => {
                if (electoralDistrictId.endsWith('_' + id)) {
                  const argId = electoralDistrictId.replace(/^person_/g, '');
                  const obj = {
                    command: '/r',
                    args: 'gik/' + electoralDistrictType + '/' + argId + '/' + electionData.gik.id // FIXME variable gik id?
                  };
                  const args = {id, command: obj.command + '_' + obj.args};
                  if (electoralDistrictType === 'municipality') {
                    args.municipality = electoralDistrictId.split('_')[1];
                    args.municipality_latin = cyrillicToLatin(args.municipality);
                    args.municipality_info_url = context.__('url.info.' + electoralDistrictType + '.' + args.municipality);
                  } else {
                    args[electoralDistrictType + '_info_url'] = context.__('url.info.' + electoralDistrictType);
                  }
                  obj.text = context.__('select.result.' + electoralDistrictType + '.text', args);
                  obj.alias = context.__('emoji.alias.result_bars') + ' ' + context.__('select.result.' + electoralDistrictType + '.alias', args);
                  result.push(obj);
                  onlyCommissions = false;
                }
              });
            });
        }

        const uik = electionData.uiks[id];
        if (uik) {
          const obj = {
            command: '/commission',
            args: 'uik_' + uik.id
          };
          result.push(obj);
          obj.text = context.__('select.uik.text', {id, district: districtName(context, uik.district), 'command': obj.command + '_' + obj.args});
          obj.alias = context.__('emoji.alias.uik') + ' ' + context.__('select.uik.alias', {id, 'command': obj.command + '_' + obj.args});
        }

        const tik = electionData.gik.tiks[id];
        if (tik) {
          const obj = {
            command: '/commission',
            args: 'tik_' + tik.id
          };
          obj.text = context.__('select.tik.text', {id, district: districtName(context, tik.district), command: obj.command + '_' + obj.args});
          obj.alias = context.__('emoji.alias.tik') + ' ' + context.__('select.tik.alias', {id, command: obj.command + '_' + obj.args});
          result.push(obj);
        }

        if (result.length == 0) {
          await bot.sendMessage(origin.chat.id,
            context.__('select.notFound', {id}),
            {parse_mode: 'HTML'}
          );
          return;
        }

        if (result.length == 1) {
          const program = userPrograms[result[0].command];
          if (program && (await runCommand(program, result[0], origin, electionData))) {
            return;
          }
        }

        let text = context.__n(onlyCommissions ? 'select.commission_header' : 'select.header', result.length, {id}) + '\n';
        let inline_keyboard = [];
        result.forEach((command, index) => {
          if (text.length) {
            text += '\n';
          }
          text += '• ' + command.text;
          const button = {
            text: command.alias,
            callback_data: command.command + ' ' + command.args
          };
          if (inline_keyboard.length == 1 && result[0].command === '/commission' && command.command === '/commission') {
            inline_keyboard[0].push(button);
          } else {
            inline_keyboard.push([button]);
          }
        });
        text += '\n\n' + context.__(onlyCommissions ? 'select.commission_footer' : 'select.footer');
        await sendMessage(bot, origin.chat.id, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {inline_keyboard}
        });
      }
    },

    '/commission': {
      suffixPattern: /_?([a-zA-Z0-9_]+)/,
      validate: parseCommissionContext,
      run: async (context, origin, electionData) => {
        if (context.global) {
          // TODO
          return;
        }

        const commission = context.commission;

        if (!commission) {
          await bot.sendMessage(origin.chat.id,
            context.__('commission.notFound.' + context.commission_level, {id: context.commission_id}),
            {parse_mode: 'HTML'}
          );
          return;
        }

        const commissionAddress = electionData.addresses[commission.address_id];

        const inline_keyboard = [];
        const membersReport = buildMembersReport(context, electionData, commission, false);

        let text = '';

        text += context.__('emoji.alias.' + context.commission_level) + ' ';
        text += '<b>';
        text += context.__('commission.long.' + context.commission_level + (context.commission_level === 'gik' ? '.' + context.commission_id : ''), {id: context.commission_id, id_latin: cyrillicToLatin(context.commission_id)});
        text += '</b>';
        if (commission.type !== 'gik' && commission.district) {
          text += '\n';
          text += context.__('emoji.alias.map_location') + ' ';
          text += districtName(context, commission.district);
        }
        if (commission.awards) {
          text += '\n';
          text += Object.keys(commission.awards).sort().map((key) => {
            const num = commission.awards[key];
            const url = context.__('award.' + key + '.url');
            return context.__('emoji.award.' + key) + ' ' + (num > 1 ? context.__n('award.' + key + '.description.commission_plural', num, {url}) : context.__('award.' + key + '.description.commission', {url}));
          }).join('\n');
        }
        ['tik', 'uik'].forEach((commissionType) => {
          let awards = commission[commissionType + '_awards'];
          if (awards) {
            text += '\n\n';
            text += Object.keys(awards).sort().map((key) => {
              const num = awards[key];
              const url = context.__('award.' + key + '.url');
              return context.__('emoji.award.' + key) + ' ' + context.__n('award.' + key + '.description.commission_plural', num, {url}) + ' ' + context.__('award.' + commissionType);
            }).join('\n');
          }
        });

        if (membersReport) {
          text += '\n\n';
          text += membersReport.text;
          if (membersReport.buttons) {
            inline_keyboard.push(...membersReport.buttons);
          }
        }

        text += '\n';

        const relatedButtons = [];
        if (commissionAddress) {
          text += '\n';
          const displayAddress = Object.keys(commissionAddress.address).filter((key) =>
            /*key === 'district' ||*/ key === 'street' || key === 'building'
          ).sort((a, b) => a === 'district' ? 1 : b === 'district' ? -1 : 0).map((key) => commissionAddress.address[key]).join(', ');
          text += context.__('emoji.alias.location') + ' ' + (context.isLatinLocale ? cyrillicToLatin(displayAddress) : displayAddress);
          text += '\n';
          text += context.__(commissionAddress.abroad ? 'emoji.address.country.' + commissionAddress.address.country : 'emoji.address.' + commissionAddress.type) + ' ' + venueName(context, commissionAddress);
          const otherCommissions = allCommissionsOf(electionData, commissionAddress)
            .filter((otherCommission) => otherCommission.type !== commission.type || otherCommission.id != commission.id);
          if (otherCommissions.length) {
            text += '\n';
            text += context.__('emoji.index.right') + ' ';
            text += (otherCommissions.length === 1 ? context.__('commission.report.other.one') : context.__n('commission.report.other.few', otherCommissions.length));
            text += ': <b>' + otherCommissions
              .map((commission) => context.__('commission.short.' + commission.type, {id: commission.id}))
              .join(', ') + '</b>';
            otherCommissions.forEach((commission) => {
              let row = relatedButtons.length && relatedButtons[relatedButtons.length - 1].length < 2 ? relatedButtons[relatedButtons.length - 1] : null;
              if (row == null) {
                row = [];
                relatedButtons.push(row);
              }
              row.push({
                text: context.__('emoji.index.right') + ' ' + context.__('commission.short.' + commission.type, {id: commission.id}),
                callback_data: '/commission ' + commission.type + '_' + commission.id
              });
            });
          }
        }

        if (commission.unknown) {
          text += '\n';
          text += context.__('emoji.alias.question') + ' ' + context.__('hints.unknown_commission');
        }
        text += '\n';
        text += context.__('emoji.index.up') + ' ' + context.__('commission.parent') + ': ';
        text += '<b>';
        text += commission.parent_commission ? context.__('commission.short.' + commission.parent_commission.type, {id: commission.parent_commission.id}) : context.__('commission.short.cik');
        text += '</b>';
        if (commission.parent_commission) {
          const button = {
            text: context.__('emoji.index.up') + ' ' + context.__('emoji.alias.' + commission.parent_commission.type) + ' ' + context.__('commission.short.' + commission.parent_commission.type, {id: commission.parent_commission.id}),
            callback_data: '/commission ' + commission.parent_commission.type + '_' + commission.parent_commission.id
          };
          let row = relatedButtons.length && relatedButtons[relatedButtons.length - 1].length < 2 ? relatedButtons[relatedButtons.length - 1] : null;
          if (row == null) {
            row = [];
            relatedButtons.push(row);
          }
          row.push(button);
        }

        if (commission.empty) {
          text += '\n\n';
          text += context.__('emoji.warning.critical') + ' ' + context.__('commission.empty');
        } else if (commission.electoral_districts) {
          let counter = 0;
          const maxResultPerRow = 1;

          let resultButtons = null;
          let lastButtonMunicipality = null;
          const addDistrict = (electoralDistrictType, municipality, electoralDistrictIds) => {
            const url = context.__('url.info.' + electoralDistrictType + (municipality ? '.' + municipality : ''));
            const count = Array.isArray(electoralDistrictIds) ? electoralDistrictIds.length : 1;

            let candidatesCount = 0;
            if (Array.isArray(electoralDistrictIds)) {
              electoralDistrictIds.forEach((electoralDistrictId) => {
                candidatesCount += municipality ? electionData.gik.stats.candidates_count[electoralDistrictType][municipality][electoralDistrictId] : electionData.gik.stats.candidates_count[electoralDistrictType][electoralDistrictId];
              });
            } else {
              candidatesCount += municipality ? electionData.gik.stats.candidates_count[electoralDistrictType][municipality][electoralDistrictIds] : electionData.gik.stats.candidates_count[electoralDistrictType][electoralDistrictIds];
            }

            text += '\n\n';
            text += '<b>';
            text += context.__('election.' + electoralDistrictType, {
              info_url: url,
              municipality
            });
            text += '</b>:';
            const electionTypes = [];

            if (lastButtonMunicipality !== municipality) {
              resultButtons = null;
              lastButtonMunicipality = municipality;
            }

            const facts = [];

            const partiesCount = municipality ? 0 : electionData.gik.stats.parties_count[electoralDistrictType];
            if (partiesCount) {
              let partyDescription = context.__('electoral_district.parties', {
                info_url: context.__('url.info.parties.' + electoralDistrictType)
              }) + ' — ' + context.__n('electoral_district.description.parties', partiesCount);

              const protocol =
                commission.type === 'uik' ? electionData.results_by_uik[commission.id][electoralDistrictType].parties :
                  commission.type === 'tik' ? electionData.results_by_tik[electoralDistrictType].parties[commission.id] :
                    commission.type === 'gik' ? electionData.results_by_gik[electoralDistrictType].parties[commission.id] :
                      null;
              if (!protocol)
                throw Error();

              if (protocol.metadata.voters.registered_count) {
                facts.push(context.__n('analysis.registered_count', protocol.metadata.voters.registered_count));
                if (protocol.metadata.voters.attached_count) {
                  facts.push(context.__n('analysis.attached_count', protocol.metadata.voters.attached_count));
                }
                facts.push(context.__n('analysis.valid_count', protocol.metadata.papers.valid_count, {percentage: toDisplayPercentage(protocol.metadata.papers.valid_count / protocol.metadata.voters.registered_count * 100)}));
              }
              if (protocol.metadata.analysis.exceeded_papers_count) {
                facts.push(context.__n('analysis.exceeded_papers_count', protocol.metadata.analysis.exceeded_papers_count) + context.__(protocol.metadata.analysis.exceeded_papers_steal_winning || protocol.metadata.analysis.exceeded_papers_provide_extra_places ? 'emoji.violation.stealing' : 'emoji.violation.exceeding'));
              }

              if (facts.length) {
                partyDescription += '\n' + facts.map((item) => '•  ' + item).join('\n');
                facts.length = 0;
              }
              electionTypes.push(partyDescription);

              if (resultButtons == null || resultButtons.length === maxResultPerRow) {
                resultButtons = [];
                inline_keyboard.push(resultButtons);
              }

              resultButtons.push({
                text: context.__('emoji.alias.result') + ' ' + context.__('electoral_district.alias.' + electoralDistrictType + '.parties', {municipality, municipality_latin: cyrillicToLatin(municipality)}) + ' ' + context.__('emoji.alias.' + commission.type),
                callback_data: '/g ' + (commission.type === 'uik' ? [commission.type, commission.id, electoralDistrictType, 0] : [commission.type, electoralDistrictType, 0, commission.id]).join('/')
              });
            }

            let candidatesDescription, registeredCount, validPapersCount, exceededCount, attachedCount, stolenCount, extraSpaceCount;
            if (count === 1) {
              candidatesDescription = context.__('electoral_district.' + (municipality ? 'multiple' : 'single') + '.one', {id: electoralDistrictIds});
              if (resultButtons == null || resultButtons.length === maxResultPerRow) {
                resultButtons = [];
                inline_keyboard.push(resultButtons);
              }
              resultButtons.push({
                text: context.__('emoji.alias.result') + ' ' + context.__('electoral_district.alias.' + electoralDistrictType + '.person', {id: electoralDistrictIds, municipality, municipality_latin: cyrillicToLatin(municipality)}) + ' ' + context.__('emoji.alias.' + commission.type),
                callback_data: '/g ' + (commission.type === 'uik' ? [commission.type, commission.id, electoralDistrictType, (municipality ? municipality + '_' : '') + electoralDistrictIds] : [commission.type, electoralDistrictType, (municipality ? municipality + '_' : '') + electoralDistrictIds, commission.id]).join('/')
              });
              const protocol =
                commission.type === 'uik' ? electionData.results_by_uik[commission.id][electoralDistrictType]['person_' + (municipality ? municipality + '_' : '') + electoralDistrictIds] :
                  commission.type === 'tik' ? electionData.results_by_tik[electoralDistrictType]['person_' + (municipality ? municipality + '_' : '') + electoralDistrictIds][commission.id] :
                    commission.type === 'gik' ? electionData.results_by_gik[electoralDistrictType]['person_' + (municipality ? municipality + '_' : '') + electoralDistrictIds][commission.id] :
                      null;
              if (!protocol) {
                throw Error();
              }
              registeredCount = protocol.metadata.voters.registered_count;
              validPapersCount = protocol.metadata.papers.valid_count;
              attachedCount = protocol.metadata.voters.attached_count;
              exceededCount = protocol.metadata.analysis.exceeded_papers_count;
              stolenCount = protocol.metadata.analysis.exceeded_papers_steal_winning;
              extraSpaceCount = protocol.metadata.analysis.exceeded_papers_provide_extra_places || 0;
            } else {
              const protocols = electoralDistrictIds.map((electoralDistrictId) => {
                const protocol =
                  commission.type === 'uik' ? electionData.results_by_uik[commission.id][electoralDistrictType]['person_' + (municipality ? municipality + '_' : '') + electoralDistrictId] :
                    commission.type === 'tik' ? electionData.results_by_tik[electoralDistrictType]['person_' + (municipality ? municipality + '_' : '') + electoralDistrictId][commission.id] :
                      commission.type === 'gik' ? electionData.results_by_gik[electoralDistrictType]['person_' + (municipality ? municipality + '_' : '') + electoralDistrictId][commission.id] :
                        null;
                if (!protocol) {
                  throw Error();
                }
                return protocol;
              });
              registeredCount = arraySum(protocols, (result) => result.metadata.voters.registered_count);
              validPapersCount = arraySum(protocols, (result) => result.metadata.papers.valid_count);
              attachedCount = arraySum(protocols, (result) => result.metadata.voters.attached_count);
              exceededCount = arraySum(protocols, (result) => result.metadata.analysis.exceeded_papers_count);
              stolenCount = arraySum(protocols, (result) => result.metadata.analysis.exceeded_papers_steal_winning);
              extraSpaceCount = arraySum(protocols, (result) => result.metadata.analysis.exceeded_papers_provide_extra_places || 0);

              if (electoralDistrictIds.length === electoralDistrictIds[electoralDistrictIds.length - 1] - electoralDistrictIds[0] + 1) {
                candidatesDescription = context.__('electoral_district.' + (municipality ? 'multiple' : 'single') + '.range', {
                  from: electoralDistrictIds[0],
                  to: electoralDistrictIds[electoralDistrictIds.length - 1]
                });
              } else {
                candidatesDescription = context.__('electoral_district.' + (municipality ? 'multiple' : 'single') + '.few', {ids: electoralDistrictIds.map((id) => '<code>№' + id + '</code>').join(', ')});
              }
            }
            candidatesDescription += ' — ' + context.__n('electoral_district.description.candidates', candidatesCount);

            if (registeredCount) {
              facts.push(context.__n('analysis.registered_count', registeredCount));
              /*if (attachedCount) {
                facts.push(context.__n('analysis.attached_count', attachedCount));
              }*/
            }
            if (validPapersCount) {
              facts.push(context.__n('analysis.valid_count', validPapersCount, {percentage: toDisplayPercentage(validPapersCount / registeredCount * 100)}));
            }
            if (exceededCount) {
              facts.push(context.__n('analysis.exceeded_papers_count', exceededCount) + context.__(stolenCount || extraSpaceCount ? 'emoji.violation.stealing' : 'emoji.violation.exceeding'));
            }
            if (facts.length) {
              candidatesDescription += '\n' + facts.map((item) => '•  ' + item).join('\n');
              facts.length = 0;
            }
            electionTypes.push(candidatesDescription);

            if (count > 1 && count < 6) {
              electoralDistrictIds.forEach((electoralDistrictId) => {
                if (resultButtons == null || resultButtons.length === maxResultPerRow) {
                  resultButtons = [];
                  inline_keyboard.push(resultButtons);
                }
                resultButtons.push({
                  text: context.__('emoji.alias.result') + ' ' + context.__('electoral_district.alias.' + electoralDistrictType + '.person', {id: electoralDistrictId, municipality, municipality_latin: cyrillicToLatin(municipality)}) + ' ' + context.__('emoji.alias.' + commission.type),
                  callback_data: '/g ' + (commission.type === 'uik' ? [commission.type, commission.id, electoralDistrictType, (municipality ? municipality + '_' : '') + electoralDistrictId] : [commission.type, electoralDistrictType, (municipality ? municipality + '_' : '') + electoralDistrictId, commission.id]).join('/')
                });
              });
            }

            text += '\n\n';
            text += electionTypes.map((type) => '<b>' + ++counter + '.</b>' + ' ' + type).join('\n\n');
          };
          /*Object.keys(commission.electoral_districts).forEach((electoralDistrictType) => {
            if (electoralDistrictType === 'municipality') {
              Object.keys(commission.electoral_districts[electoralDistrictType]).forEach((municipality) => {
                addDistrict(electoralDistrictType, municipality, commission.electoral_districts[electoralDistrictType][municipality]);
              });
            } else {
              addDistrict(electoralDistrictType, null, commission.electoral_districts[electoralDistrictType]);
            }
          });
          inline_keyboard.push(...relatedButtons);*/
          const allProtocols = allProtocolsOf(electionData, commission);
          const review = buildProtocolsReview(context, electionData, allProtocols);
          if (review) {
            text += '\n\n' + review.text;
            inline_keyboard.push(...review.inline_keyboard);
          }
        }

        await sendMessage(bot, origin.chat.id, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {inline_keyboard}
        });
      }
    },

    '/members': {
      suffixPattern: /_?([a-z_0-9]+)/,
      validate: parseCommissionContext,
      run: async (context, origin, electionData) => {
        if (context.global) {
          // TODO global report on all members
          return;
        }

        const commission = context.commission;

        if (!commission) {
          await bot.sendMessage(origin.chat.id,
            context.__('commission.notFound.' + context.commission_level, {id: context.commission_id}),
            {parse_mode: 'HTML'}
          );
          return;
        }

        const membersReport = buildMembersReport(context, electionData, context.commission, true);

        if (!membersReport) {
          await bot.sendMessage(origin.chat.id,
            context.__('commission.notFound.' + context.commission_level, {id: context.commission_id}),
            {parse_mode: 'HTML'}
          );
          return;
        }

        let text = '';

        text += context.__('emoji.alias.members') + ' ';
        if (context.commission_level != 'gik') {
          const args = {};
          args[context.commission_level + '_id'] = context.commission_id;
          text += context.__('members.report.header.' + context.commission_level, args);
        } else {
          text += context.__('members.report.header.gik.' + context.commission_id, )
        }

        const inline_keyboard = [];

        text += '\n\n';
        text += membersReport.text;
        if (membersReport.buttons) {
          inline_keyboard.push(...membersReport.buttons);
        }

        text += '\n';
        if (membersReport.source_date) {
          text += '\n' + context.__('members.report.date', {date: moment(membersReport.source_date).locale(context.activeLocale).format('MMMM YYYY')});
        }
        if (membersReport.members_with_relatives) {
          text += '\n' + context.__('members.report.relatives_disclaimer.format', {
            members_count: context.__n('members.report.relatives_disclaimer.members', electionData.gik.stats.all_members.total_count),
            commissions_count: context.__n('members.report.relatives_disclaimer.commissions', 1 + electionData.gik.stats.tik_count + electionData.gik.stats.uik_count)
          });
        }
        text += '\n' + context.__('members.report.disclaimer');

        await sendMessage(bot, origin.chat.id, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {inline_keyboard}
        });
      }
    },

    '/result': {
      suffixPattern: /_?([a-z_0-9а-я ]+)/,
      validate: parseResultContext,
      run: async (context, origin, electionData) => {
        if (!context.result) {
          await bot.sendMessage(origin.chat.id,
            context.__('result.notFound', {level: context.level, path: context.path}),
            {parse_mode: 'HTML'}
          );
          return;
        }

        const protocol = context.result;
        const commission = context.commission;

        let inline_keyboard = [];

        inline_keyboard.push([{
          text: context.__('emoji.alias.result') + ' ' + context.__('visual.dynamic.uik'),
          callback_data: '/g ' + graphOptions({votes_dynamics: true}) + ' ' + context.cleanArgs
        }]);
        if (Array.isArray(protocol.related_to.tik)) {
          inline_keyboard.push([{
            text: context.__('emoji.alias.result') + ' ' + context.__('visual.dynamic.tik'),
            callback_data: '/g ' + graphOptions({votes_dynamics: true, by_tik: true}) + ' ' + context.cleanArgs
          }]);
        }
        if (protocol.electoral_district.type !== 'municipality') {
          const forceBarsByTik = Array.isArray(protocol.related_to.tik) && (protocol.protocol_scope.type === 'district' || protocol.protocol_scope.type === 'gik') && (!protocol.electoral_district.id || protocol.electoral_district.type === 'federal');
          if (Array.isArray(protocol.related_to.tik) || forceBarsByTik) {
            ['turnout'/*, 'turnout_count'*/].forEach((key) => {
              const opts = {
                by_tik: forceBarsByTik,
                sort_by_tik: !forceBarsByTik
              };
              opts[key] = true;
              inline_keyboard.push([{
                text: context.__('emoji.alias.result_bars') + ' ' + context.__('visual.' + key + '_' + (context.result.entries[0].party_id ? 'parties' : 'candidates') + '.tik'),
                callback_data: '/g ' + graphOptions(opts) + ' ' + context.cleanArgs
              }]);
            });
          }
          ['turnout'/*, 'turnout_count'*/].forEach((key) => {
            const opts = {};
            opts[key] = true;
            inline_keyboard.push([{
              text: context.__('emoji.alias.result_bars') + ' ' + context.__('visual.' + key + '_' + (protocol.entries[0].party_id ? 'parties' : 'candidates') + '.uik'),
              callback_data: '/g ' + graphOptions(opts) + ' ' + context.cleanArgs
            }]);
          });

          /*inline_keyboard.push([{
            text: context.__('emoji.alias.comet') + ' ' + context.__('visual.comet'),
            callback_data: '/g ' + graphOptions({comet: true}) + ' ' + context.cleanArgs
          }]);*/
        }

        let text = '';
        text += context.__('emoji.alias.result_bars') + ' <b>';
        let info_url;
        if (context.municipality) {
          info_url = context.__('url.info.' + context.electoral_district_type + '.' + context.municipality);
        } else {
          info_url = context.__('url.info.' + context.electoral_district_type);
        }
        text += context.__('electoral_district.' + context.electoral_district_type, {info_url, municipality: context.municipality, municipality_latin: cyrillicToLatin(context.municipality)});
        text += '. ';
        if (context.electoral_district_id === 'parties') {
          text += context.__('electoral_district.parties', {info_url: context.__('url.info.parties.' + context.electoral_district_type)});
        } else if (context.municipality) {
          text += context.__('electoral_district.single.one', {id: context.municipality_district_id});
        } else {
          text += context.__('electoral_district.single.one', {id: context.electoral_district_id});
        }
        text += '</b>\n';

        if (commission) {
          text += context.__('emoji.alias.' + commission.type) + ' ' + context.__('result.commission.medium.' + commission.type, {id: commission.id, id_latin: cyrillicToLatin(commission.id)});
        } else {
          text += context.__('emoji.alias.district') + ' ' + context.district;
        }

        const review = buildProtocolsReview(context, electionData, [protocol], true);

        if (review) {
          text += '\n\n';
          text += review.text;
          inline_keyboard.push(...review.inline_keyboard);
        }

        await sendMessage(bot, origin.chat.id, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {inline_keyboard}
        });
      }
    },

    '/update': {
      run: async (context, origin, electionData) => {
        if (origin.chat.id !== settings.owner_user_id)
          return;

        const updatedFiles = [];

        const graphDir = path.join('images', 'charts', context.headers.locale);
        fs.mkdirSync(graphDir, {recursive: true});

        const graphCallback = async (result, jpg, isTurnout) => {
          let fileName = result.electoral_district.type +
            (result.electoral_district.municipality ? '-' + result.electoral_district.municipality : '')
            + '-' + (result.electoral_district.id || 'parties');
          if (result.protocol_scope.type !== 'gik') {
            fileName += '-' + result.protocol_scope.type + '-' + result.protocol_scope.id;
          }
          if (isTurnout) {
            fileName += '-bars';
          }
          fileName += '.jpg';
          const filePath = path.join(graphDir, fileName);
          console.log('Updating image', filePath);
          fs.writeFileSync(filePath, jpg);
          updatedFiles.push(fileName);
        };

        for (const scopeType in electionData.results_by_gik) {
          const scopeResults = electionData.results_by_gik[scopeType];
          for (const scopeId in scopeResults) {
            const scopeIdArg = scopeId.replace(/^person_/, ''); //.replace(/^parties$/, '0');
            const gikResults = scopeResults[scopeId];
            for (const gikId in gikResults) {
              context.args = 'gik/' + scopeType + '/' + scopeIdArg + '/' + gikId;
              if (parseResultContext(context, origin, electionData)) {
                await runChartProgram(context, origin, electionData, context.options, graphCallback);
              }
              if (scopeType !== 'municipality') {
                context.args = graphOptions({turnout: true, by_tik: scopeId === 'parties' || scopeType === 'federal'}) + ' ' + context.args;
                if (parseResultContext(context, origin, electionData)) {
                  await runChartProgram(context, origin, electionData, context.options, graphCallback);
                }
              }
            }
            if ((scopeId === 'parties' || scopeType === 'federal') && scopeType !== 'municipality') {
              const tikResults = electionData.results_by_tik[scopeType][scopeId];
              for (const tikId in tikResults) {
                context.args = 'tik/' + scopeType + '/' + scopeIdArg + '/' + tikId;
                if (parseResultContext(context, origin, electionData)) {
                  await runChartProgram(context, origin, electionData, context.options, graphCallback);
                }
                context.args = graphOptions({turnout: true}) + ' ' + context.args;
                if (parseResultContext(context, origin, electionData)) {
                  await runChartProgram(context, origin, electionData, context.options, graphCallback);
                }
              }
            }
          }
        }

        if (updatedFiles.length) {
          await bot.sendMessage(origin.chat.id, context.__('emoji.alias.selected') + ' Successfully updated <b>' + updatedFiles.length + ' files</b> inside <code>' + graphDir + '</code>.', {
            parse_mode: 'HTML'
          });
        } else {
          await bot.sendMessage(origin.chat.id, context.__('emoji.warning.cross') + ' <b>No files updated</b>>', {
            parse_mode: 'HTML'
          });
        }
      }
    },

    '/graph': {
      suffixPattern: /_?([a-z_0-9а-я ]+)/,
      validate: parseResultContext,
      run: async (context, origin, electionData) => {
        return await runChartProgram(context, origin, electionData, context.options);
      }
    },
    '/e':{
      run: async (context, origin, electionData) => {
        context.toast = context.__('toast.already_selected');
      }
    }
  };

  const shortcuts = {
    'r': 'result',
    'g': 'graph',
    'd': 'district',
    'c': 'commission'
  };
  for (const shortcut in shortcuts) {
    if (!shortcuts.hasOwnProperty(shortcut))
      continue;
    const fullName = shortcuts[shortcut];
    if (userPrograms[shortcut])
      throw Error('/' + shortcut + ' already defined!');
    const program = userPrograms['/' + fullName];
    if (!program)
      throw Error('Unknown program /' + fullName);
    userPrograms['/' + shortcut] = program;
  }

  const userSettings = {};
  const getUserSetting = async (userId, key, valueEncoding) => {
    valueEncoding = valueEncoding ? {valueEncoding} : undefined;
    let settings = userSettings[userId];
    if (settings) {
      const cachedValue = settings[key];
      if (cachedValue !== undefined) {
        return cachedValue;
      }
    } else {
      userSettings[userId] = settings = {};
    }
    try {
      const settingKey = 'settings_user_' + userId + '_' + key;
      const setting = await db.get(settingKey, valueEncoding);
      settings[key] = setting;
      return setting;
    } catch (e) {
      settings[key] = null;
      return null;
    }
  };
  const storeUserSetting = async (userId, key, value, valueEncoding) => {
    valueEncoding = valueEncoding ? {valueEncoding} : undefined;
    if (!value) {
      value = null;
    }
    let settings = userSettings[userId];
    if (settings) {
      const cachedValue = settings[userId];
      if (cachedValue === value)
        return;
      settings[key] = value;
    } else {
      settings = {};
      settings[key] = value;
      userSettings[userId] = setings;
    }
    const settingKey = 'settings_user_' + userId + '_' + key;
    try {
      if (value) {
        await db.put(settingKey, value, valueEncoding);
      } else {
        await db.del(settingKey);
      }
    } catch (e) {
      onIOError(e);
    }
  };
  const runCommand = async (program, textCommand, origin, electionData) => {
    let languageCode = await getUserSetting(origin.from.id, 'language');
    if (!languageCode) {
      languageCode = normalizeLanguageCode(origin.from.language_code);
      await storeUserSetting(origin.from.id, 'language', languageCode);
      await bot.sendMessage(ADMIN_CHAT_ID,
        '👤 New user: ' +
        '<b>' +
        htmlUserName(origin.from) +
        '</b>\n#new_user #' + (origin.from.language_code || 'unknown_locale'), {
          parse_mode: 'HTML',
          disable_notification: true
        });
    }
    const init = (target) => {
      i18n.init(target);
      const originalPlural = target.__n;
      target.__n = (singular, plural, count) => {
        const args = count || {};
        args.counter = formatNumber(plural);
        return originalPlural(singular, plural, args);
      };
      textCommand.activeLocale = target.__('locale');
      textCommand.isLatinLocale = !!parseInt(target.__('is_latin'));
    };
    textCommand.switchLanguage = async (newLocale) => {
      newLocale = normalizeLanguageCode(newLocale);
      if (newLocale === textCommand.headers.locale)
        return true;
      const locales = i18n.getLocales();
      if (locales.includes(newLocale)) {
        await storeUserSetting(origin.from.id, 'language', newLocale);
        textCommand.headers.locale = newLocale;
        delete textCommand.__;
        delete textCommand.__n;
        init(textCommand);
        return true;
      }
      return false;
    };
    textCommand.headers = {
      locale: normalizeLanguageCode(languageCode)
    };
    init(textCommand);

    if (program.validate && !program.validate(textCommand, origin, electionData)) {
      return false;
    }

    console.log('Running', textCommand.command);
    await program.run(textCommand, origin, electionData);
    return true;
  }

  const handleUserMessage = async (message) => {
    const text = message.text;
    const entities = message.entities;

    let textCommand = findTextCommand(text, entities);
    if (!textCommand) { // if specific command was not found
      textCommand = convertToCommand(text, entities, electionData);
    }

    let program = textCommand ? userPrograms[textCommand.command] : null;
    if (textCommand && !program) {
      for (const command in userPrograms) {
        if (!userPrograms.hasOwnProperty(command)) {
          continue;
        }
        let programGuess = userPrograms[command];
        if (programGuess.suffixPattern) {
          const regExp = RegExp('^' + command + programGuess.suffixPattern.source + '$');
          const match = textCommand.command.match(regExp);
          if (match) {
            program = programGuess;
            textCommand = {
              command,
              args: match[match.length - 1]
            };
            break;
          }
        }
      }
    }
    if (!(program && (await runCommand(program, textCommand, message, electionData)))) {
      handleFeedback(message);
    }
  };

  // LISTENERS

  const messageCallback = (message) => {
    // console.log('message:', toJson(message));
    if (message.chat.id === ADMIN_CHAT_ID) {
      handleAdminMessage(message);
    } else if (message.chat.type === 'private' || message.chat.type === 'secret') {
      if (isDebug && message.from.id !== 163957826) {
        handleFeedback(message);
        return;
      }
      handleUserMessage(message);
    }
  };

  const callbackQueryCallback = async (query) => {
    const index = query.data.indexOf(' ');
    const command = {
      command: index === -1 ? query.data : query.data.substring(0, index)
    };
    if (index !== -1) {
      command.args = query.data.substring(index + 1);
    }
    const program = userPrograms[command.command];
    let success = false;
    if (program) {
      try {
        const origin = {chat: query.message.chat, from: query.from, message_id: query.message.message_id, inline_message_id: query.inline_message_id};
        command.edit_message_target = origin.message_id ? {
          chat_id: origin.chat.id,
          message_id: origin.message_id
        } : origin.inline_message_id ? {inline_message_id: origin.inline_message_id} : null;
        await runCommand(program, command, origin, electionData);
        success = true;
      } catch (e) {
        console.log('Failed command', command.command, e);
      }
    } else {
      return;
    }
    if (success && !command.toast) {
      await bot.answerCallbackQuery(query.id);
    } else {
      await bot.answerCallbackQuery(query.id, command.toast || command.__('toast.error'));
    }
  };
  const inlineQueryCallback = (inlineQuery) => {
    console.log('inline_query:', toJson(inlineQuery));
  };
  const chosenInlineResultCallback = (chosenInlineResult) => {
    console.log('chosen_inline_result:', toJson(chosenInlineResult));
  };

  bot.on('message', messageCallback);
  bot.on('channel_post', messageCallback);
  bot.on('callback_query', callbackQueryCallback);
  bot.on('inline_query', inlineQueryCallback);
  bot.on('chosen_inline_result', chosenInlineResultCallback);
  bot.on('polling_error', onPollingError);
  bot.on('error', onGlobalError);

  let isStopping = false;
  let botStarted = false;

  ['SIGTERM', 'SIGINT', 'uncaughtException', 'unhandledRejection'].forEach((signal) => {
    process.on(signal, (arg1, arg2) => {
      const badSignal = ['uncaughtException', 'unhandledRejection'].includes(signal);
      const isManual = signal === 'SIGINT';
      console.log('Received', signal, arg1, arg2, isStopping);
      if (signal === 'unhandledRejection' || isStopping)
        return;
      isStopping = true;
      (async () => {
        if (botStarted) {
          console.log('Sending "stopping" message');
          await bot.sendMessage(ADMIN_CHAT_ID, (isManual ? 'ℹ️' : '⚠️') + ' <b>' + signal + '</b> received: <b>bot is stopping</b>.', {
            parse_mode: 'HTML',
            disable_notification: isManual
          }).catch(onLocalError);
        }
        console.log('Stopping bot...');
        const botDownTime = Date.now();
        await db.put('last_down_time', botDownTime);
        const upTime = new Duration(new Date(botLaunchTime), new Date(botDownTime));
        await db.close();
        if (botStarted) {
          console.log('Sending "stop" message');
          await bot.sendMessage(ADMIN_CHAT_ID, '🆘 <b>Bot stopped</b>. <b>Uptime</b>: <code>' + upTime.toString(1) + '</code>', {
            parse_mode: 'HTML',
            disable_notification: true
          }).catch(onLocalError);
        }
        console.log('Bot stopped. Finishing process.');
        process.exit(badSignal || !botStarted ? 1 : 0);
      })();
    });
  });

  const locales = i18n.getLocales();
  const commands = [
    'start',
    'districts'
  ];
  for (let i = 0; i < locales.length; i++) {
    const locale = locales[i];
    const context = {headers: {locale}};
    i18n.init(context);
    await bot.setMyCommands(commands.map((command) => {
      return {
        command,
        description: context.__('command.' + command)
      }
    }), {
      scope: {type: 'all_private_chats'},
      language_code: locale
    });
  }

  const botLaunchTime = Date.now();
  let lastBotDownTime = 0;
  try {
    lastBotDownTime = parseInt(await db.get('last_down_time'));
  } catch (ignored) { }
  let startupMessage = '✅ <b>Bot started</b>.';
  if (lastBotDownTime) {
    const downTime = new Duration(new Date(lastBotDownTime), new Date(botLaunchTime));
    startupMessage += ' <b>Downtime</b>: <code>' + downTime.toString(1) + '</code>';
  }
  await bot.sendMessage(ADMIN_CHAT_ID, startupMessage, {parse_mode: 'HTML', disable_notification: true}).then((message) => {
    botStarted = true;
    bot.startPolling();
  }).catch((e) => {
    console.error('Cannot send startupMessage, killing bot…');
    console.error(e);
    process.kill(process.pid);
  });
}

// MAIN

const robotoFonts = {};

function font (px, style) {
  style = style || 'normal';
  const font = robotoFonts[style];
  if (!font)
    throw Error(style);
  return font.style + ' normal ' + (style === 'normal' ? 'normal' : font.weight) + ' ' + px + 'px ' + font.family;
}

const themes = {
  light: {
    filling: '#FFF',
    background: '#F2F2F2',
    backgroundText: '#71787E',
    text: '#000000',
    textLight: '#838C96',
    textNegative: '#E45356',
    separator: '#DEE3EA',
    highlight: '#569ACE30',

    voters: {
      'abstained': '#BEC2C7',
      'winning': '#29B6F6',
      'losing': '#D32F2F',
      'smart': '#ff3300',
      'exceeding': '#D32F2F'
    },
    papers: {
      'invalid': '#000000',
      'lost': '#ff0000',
      'ignored': '#ff0000',
      'taken_home': '#4a4a4a'
    },
    party: {
      'Новые Люди': '#65DCD7',
      'Справедливая Россия': '#F3BD51', // '#FFF051', // '#EEBF4B',

      'Коммунистическая Партия Российской Федерации': '#B42819',
      'Родина': '#ff80ab',
      'Партия Пенсионеров': '#ff8a65',

      'Яблоко': '#51B25B',
      'Зелёные': '#347843',
      'Зеленая Альтернатива': '#5C942B',

      'Единая Россия': '#354F9E',
      'ЛДПР': '#78909c', //'#3F5583',
      'Партия Роста': '#bbdefb',

      'Партия Свободы и Справедливости': '#dc0ab4',
      'Коммунисты России': '#8D6E63',

      'Гражданская Платформа': '#611F5D',

      'other': [
        '#9388E1',
        // '#e60049',
        '#0bb4ff',
        '#50e991',
        '#e6d800',
        '#9b19f5',
        '#ffa300',
        '#dc0ab4',
        '#b3d4ff',
        '#00bfa0'
      ]
    }
  }
};

async function fetchAllUiks (regions, electionDataId) {
  const root = (await getJsonFile(
    path.join('data-raw', 'election', electionDataId.toString(), 'root.json'),
    'http://www.izbirkom.ru/region/izbirkom?action=tvdTree&vrn=' + electionDataId,
    true
  )).response;
  for (let regionIndex = 0; regionIndex < root.children.length; regionIndex++) {
    const region = root.children[regionIndex];
    const tvdId = parseInt(region.href.match(/(?<=tvd=)(\d+)/g)[0]);
    if (!tvdId)
      throw Error();
    const cache = {};
    await fetchTvdChildren(regions, cache, electionDataId, tvdId);
  }
}

function parseCommissionNumber (string) {
  const match = string.match(/(?<=(^УИК №|^ТИК №|^Участковая избирательная комиссия №|^Территориальная избирательная комиссия №))\d+/gi); // TODO tik
  return match ? parseInt(match[0]) : null;
}

function parseCommissionId (type, text) {
  text = text.replace(',', ' ').replace(/ {2,}/gi, ' ').replace('c', 'с').trim();
  if (text.match(/[A-Za-z]+/)) {
    throw Error('Latin letters found: ' + text);
  }
  const commissionId = parseCommissionNumber(text);
  switch (type) {
    case 'uik': {
      if (!commissionId) {
        throw Error('unknown ' + type + ' format: ' + text);
      }
      return commissionId;
    }
    case 'tik': {
      if (!commissionId) {
        const cityMatch = text.match(/^(?:ТИК города |ТИК г\. |ТИК г\.)([А-Яа-яЁё\-0-9]+)\s*№?(\d*)?$/i) || text.match(/^([А-Яа-яЁё\-0-9]+)(?: городская)? ТИК\s*№?(\d+)?$/i); // TODO tik
        if (cityMatch) {
          const city = cityMatch[1];
          if (!city)
            throw Error();
          const cityId = cityMatch[2];
          if (cityId && !parseInt(cityId))
            throw Error(cityId);
          const cityMap = {
            'Адыгейска': 'Адыгейск',
            'Майкопа': 'Майкоп',
            'Горно-Алтайская': 'Горно-Алтайск',
            'Баксанская': 'Баксан',
            'Нальчикская': 'Нальчик',
            'Прохладненская': 'Прохладный',
            'Воркуты': 'Воркута',
            'Вуктыла': 'Вуктыл',
            'Инты': 'Инта',
            'Сосногорска': 'Сосногорск',
            'Сыктывкара': 'Сыктывкар',
            'Усинска': 'Усинск',
            'Ухты': 'Ухта',
            'Петрозаводска': 'Петрозаводск',
            'Артёма': 'Артём'
          };
          const knownCities = [
            // Дагестан
            'Кизилюрт',
            'Кизляр',
            'Южно-Сухокумск',
            'Дербент',
            'Избербаш',
            'Каспийск',
            'Буйнакск',
            'Хасавюрт',
            // Ингушетия
            'Карабулак',
            'Магас',
            'Малгобек',
            'Назрань',
            'Сунжа',
            // Карелия
            'Костомукша',
            'Сортавала',
            // Псковская
            'Печоры'
          ];
          const cityNom = cityMap[city] || (knownCities.includes(city) ? city : null);
          if (!cityNom)
            return 'city-unknown-' + city + (cityId ? '-' + cityId : '');
          return 'city-' + cityNom + (cityId ? '-' + cityId : '');
        }
        let district = text.match(/(?<=^ТИК )[А-Яа-яЁё\-0-9]+(?= района$)/gi) || text.match(/^[А-Яа-яЁё\-0-9]+\s+(?=районная ТИК$)/gi); // TODO tik
        if (district) {
          district[0] = district[0].trim();
          if (text.startsWith('ТИК ')) {
            if (district[0].match(/[цс]кого$/i))
              return 'district-' + district[0].replace(/кого$/, 'кий');
            if (district[0].match(/ного$/i))
              return 'district-' + district[0].replace(/ного$/, 'ный');
            if (district[0].endsWith('ового'))
              return 'district-' + district[0].replace(/ового$/, 'овый');
          }
          if (text.endsWith(' районная ТИК')) {
            if (district[0].endsWith('ская'))
              return 'district-' + district[0].replace(/ская$/, 'ский');
            if (district[0].endsWith('ная'))
              return 'district-' + district[0].replace(/ная$/, 'ный');
            if (district[0].endsWith('кая'))
              return 'district-' + district[0].replace(/кая$/, 'кий');
          }
          const districtMap = {};
          const districtNom = districtMap[district[0]];
          if (!districtNom)
            throw Error('unknown district: ' + district[0]);
          return 'district-' + districtNom;
        }
        district = text.match(/(?<=^Территориальная избирательная комиссия по )[а-яА-ЯЁё0-9]+(?= району$)/gi)
        if (district) {
          if (district[0].endsWith('скому')) {
            return 'district-' + district[0].replace(/скому$/gi, 'ский');
          }
          throw Error(district[0]);
        }
        const municipalDistrict = text.match(/(?<=^ТИК муниципального района )[а-яА-ЯЁё0-9]+(?= район)/gi);
        if (municipalDistrict) {
          return 'municipal-district-' + municipalDistrict[0];
        }
        const municipality = text.match(/(?<=^ТИК муниципального образования ")[а-яА-ЯЁё0-9 \-]+(?="$)/gi)
        if (municipality) {
          return 'municipality-' + municipality[0];
        }
        let unknown = text.match(/^(?:ТИК |Территориальная избирательная комисс?ия |Избирательная комиссия )([а-яА-Я\- ".()]+)$/i) || text.match(/^([а-яА-Я\- ".]+)(?: ТИК| территориальная избирательная комиссия)$/i);
        if (unknown) {
          return 'unknown-' + unknown[1];
        }
        unknown = text.match(/^([а-яА-Я\- ".]+) ТИК([№0-9а-яА-Я\- ".]+)$/i);
        if (unknown) {
          return 'unknown-' + unknown[1] + unknown[2];
        }
        unknown = text.match(/^ТИК №?\s*([0-9]+)\s*([а-яА-Я\- ".]+)$/i);
        if (unknown) {
          return 'unknown-' + unknown[2] + '-' + unknown[1];
        }
        return 'as-is-' + secureFileName(text);
        throw Error('unknown ' + type + ' format: ' + text);
      }
      return commissionId;
    }
    case 'gik': {
      return abbreviation(text);
    }
    default:
      throw Error(type);
  }
}

async function fetchCommission (cache, regionCode, regionId, commissionType, commissionId, commissionDataId) {
  if (!commissionDataId && commissionType !== 'uik')
    throw Error(commissionType + ' ' + commissionId);
  const commissionUrl = commissionDataId ?
    'http://www.cikrf.ru/iservices/voter-services/committee/' + commissionDataId :
    'http://www.cikrf.ru/iservices/voter-services/committee/subjcode/' + regionId + '/num/' + commissionId;
  const infoPromise = getJsonFile(
    path.join('data-raw', regionCode, commissionType, commissionId.toString(), 'info.json'),
    commissionUrl,
    true
  );
  let info = null;
  if (!commissionDataId) {
    info = (await infoPromise).response;
    if (empty(info)) {
      console.error(regionCode, regionId, commissionType, commissionId, 'is unknown!');
      return;
    }
  }
  if (!commissionDataId) {
    if (!info) {
      return;
    }
    commissionDataId = parseInt(info.vrn);
  }
  const membersPromise = getJsonFile(
    path.join('data-raw', regionCode, commissionType, commissionId.toString(), 'members.json'),
    'http://www.cikrf.ru/iservices/voter-services/committee/' + commissionDataId + '/members',
    true
  );
  if (commissionType === 'uik') {
    const tree = (await getJsonFile(
      path.join('data-raw', regionCode, commissionType, commissionId.toString(), 'tree.json'),
      'http://www.cikrf.ru/iservices/voter-services/committee/' + commissionDataId + '/tree',
      true
    )).response;
    if (tree.length !== 3 && tree.length !== 2)
      throw Error(toJson(tree));
    for (let index = tree.length - 2; index >= 0; index--) {
      const parent = tree[index];
      const parentCommissionType = index === 1 ? 'tik' : index === 0 ? 'gik' : null;
      if (!parentCommissionType)
        throw Error(toJson(parent));
      const parentCommissionId = parseCommissionId(parentCommissionType, parent.name);
      if (parentCommissionId) {
        if (!cache[parentCommissionType] || !cache[parentCommissionType][parentCommissionId]) {
          const vrnId = parseInt(parent.vrn);
          if (!cache[parentCommissionType]) {
            cache[parentCommissionType] = {};
          }
          cache[parentCommissionType][parentCommissionId] = vrnId;
          await fetchCommission(cache, regionCode, regionId, parentCommissionType, parentCommissionId, vrnId);
        }
      } else {
        console.error('Unknown ' + parentCommissionType.toUpperCase() + ' format:', parent.name);
      }
    }
  }
  await membersPromise;
  if (!info) {
    await infoPromise;
  }
}

async function fetchTvdChildren (regions, cache, electionDataId, commissionDataId, tvdTree, tvd) {
  const pathArgs = [
    'data-raw', 'election', electionDataId.toString()
  ];
  tvdTree = tvdTree ? cloneArray(tvdTree) : [];
  tvdTree.push(commissionDataId);
  tvdTree.forEach((tvdId) =>
    pathArgs.push(tvdId.toString())
  );
  pathArgs.push('children.json');
  const children = (await getJsonFile(
    path.join.apply(path.join, pathArgs),
    'http://www.izbirkom.ru/region/izbirkom?action=tvdTree&vrn=' + electionDataId + '&tvdchildren=true&tvd=' + commissionDataId,
    true
  )).response;
  if (empty(children))
    throw Error(electionDataId + ' ' + commissionDataId);
  let uikIds = {};
  let regionId = null;
  for (let childrenIndex = 0; childrenIndex < children.length; childrenIndex++) {
    const child = children[childrenIndex];
    const localRegionId = parseInt(child.href.match(/(?<=&region=)\d+/g)[0]);
    if (!localRegionId)
      throw Error(toJson(child));
    if (regionId === null) {
      regionId = localRegionId;
    } else if (regionId !== localRegionId) {
      throw Error(regionId + ' vs ' + localRegionId);
    }
    if (child.isUik) {
      const uikId = parseCommissionId('uik', child.text);
      if (uikId) {
        if (uikIds[uikId])
          throw Error('Duplicate uik: ' + toJson(child));
        uikIds[uikId] = child.id;
      } else {
        console.error('Unknown UIK format:', child.text);
      }
    } else {
      await fetchTvdChildren(regions, cache, electionDataId, child.id, tvdTree, child);
    }
  }
  if (!empty(uikIds)) {
    let subjCode = regionId.toString();
    if (subjCode.length < 2) {
      subjCode = '0' + subjCode;
    }
    const region = regions[subjCode];
    if (!region)
      throw Error('Unknown region: ' + subjCode);
    let promises = [];
    for (const uikId in uikIds) {
      promises.push(fetchCommission(cache, region.code, subjCode, 'uik', uikId));
      if (promises.length === 3) {
        await Promise.all(promises);
        promises.length = 0;
      }
    }
    if (promises.length) {
      await Promise.all(promises);
      promises.length = 0;
    }
  }
}

(async () => {
  const launchDate = Date.now();

  const fonts = FontLibrary.use('Roboto', [
    path.join('fonts', 'Roboto-Regular.ttf'),
    path.join('fonts', 'Roboto-Medium.ttf'),
    path.join('fonts', 'Roboto-Bold.ttf'),
    path.join('fonts', 'Roboto-Italic.ttf')
  ]);
  fonts.push(... (FontLibrary.use('RobotoMono', [
    path.join('fonts', 'RobotoMono-Regular.ttf')
  ])));
  const fontAliases = ['normal', 'medium', 'bold', 'italic', 'monospace'];
  fonts.forEach((font, index) => {
    const alias = fontAliases[index];
    robotoFonts[alias] = font;
  });
  // console.log('Loaded', fonts.length, 'fonts', toJson(fonts));

  try {
    proxyBlacklist = await readJsonFile(path.join('cache', 'proxy_blacklist.json'));
  } catch (ignored) { }

  try {
    const regions = await readJsonFile(path.join('local', 'regions.json'));
    Object.assign(REGIONS, regions);
  } catch (ignored) { }

  /*for (const regionId in REGIONS) {
    if (!parseInt(regionId) || regionId === '00' || parseInt(regionId) === REGION_CODE)
      continue;
    const region = REGIONS[regionId];
    const firstUik = (await getJsonFile(
      path.join('data-raw', region.code, 'uik', '1', 'info.json'),
      'http://www.cikrf.ru/iservices/voter-services/committee/subjcode/' + regionId + '/num/1',
      true
    )).response;
    if (!firstUik || !firstUik.vrn) {
      console.log('No first UIK for region:', region.code, toJson(firstUik));
      continue;
    }
    const firstUikTree = (await getJsonFile(
      path.join('data-raw', region.code, 'uik', '1', 'tree.json'),
      'http://www.cikrf.ru/iservices/voter-services/committee/' + firstUik.vrn + '/tree/',
      true
    )).response;
    if (empty(firstUikTree))
      throw Error();
    if (firstUikTree.length !== 3) {
      throw Error('Weird structure: ' + toJson(firstUikTree));
    }
    for (let i = 0; i < firstUikTree.length; i++) {
      const parent = firstUikTree[i];
      if (parent.vrn === firstUik.vrn) {
        continue;
      }
      let num = parent.name.match(/(?<=№)(\d+)/g);
      if (num) {
        num = parseInt(num[0]);
      }
      if (parent.name.match(/ТИК/gi)) {
        if (num) {
          const tik = (await getJsonFile(
            path.join('data-raw', region.code, 'tik', num.toString(), 'info.json'),
            'http://www.cikrf.ru/iservices/voter-services/committee/' + parent.vrn,
            true
          )).response;
        } else {
          console.log('TIK without number', region.code, parent.name);
        }
      } else if (i !== 0) {
        console.log('Weird TIK', region.code, toJson(parent));
      }
    }
  }*/

  /*do {
    try {
      await fetchAllUiks(REGIONS, 100100225883172);
      break;
    } catch (e) {
      console.log('Failed, retrying', e);
    }
  } while (true);*/

  const koibList = await getJsonFile(path.join('local', 'koib.json'));
  const koibMap = { };
  koibList.forEach((uikId) => {
    koibMap[uikId] = true;
  });

  const staticViolations = await getJsonFile(path.join('local', 'violations.json'));

  const knownLocations = await getJsonFile(path.join('local', 'venues.json'));
  Object.keys(knownLocations).forEach((knownLocation) => {
    knownLocations[knownLocation].forEach((address) => {
      knownLocationsMap[addressToString(address, true)] = knownLocation;
    });
  });

  const awards = {
    badgesOfHonor1: (await getJsonFile(path.join('local', 'badges-of-honor-1.json'))),
    badgesOfHonor2: (await getJsonFile(path.join('local', 'badges-of-honor-2.json'))),
    diplomas: (await getJsonFile(path.join('local', 'diplomas.json'))),
    thanks: (await getJsonFile(path.join('local', 'thanks.json')))
  };

  const smartCandidates = await getJsonFile(path.join('local', 'smart.json'));

  const fileMap = {
    version: 'version.json',

    gik: 'gik.json',
    roles: 'roles.json',

    assignedBy: { folder: 'assigned_by', level: 1 },
    elections: { folder: 'elections', level: 1 },
    electoral_districts: { folder: 'electoral_districts', level: 1 },
    candidates: { folder: 'candidates', level: 1 },
    parties: { folder: 'parties', level: 1 },
    members: { folder: 'members', level: 1 },
    addresses: { folder: 'addresses', level: 1 },
    districts: { folder: 'districts', level: 1 },

    uiks: { folder: 'uiks', level: 1},
    results_by_uik: { folder: 'results_by_uik', level: 3 },
    results_by_tik: { folder: 'results_by_tik', level: 3 },
    results_by_district: { folder: 'results_by_district', level: 3 },
    results_by_gik: { folder: 'results_by_gik', level: 3 },

    violations_map: { folder: 'violations_map', level: 1 }
  };
  const data = {};

  // Step 1. Build data map
  try {
    const dataKeys = Object.keys(fileMap);
    for (let dataKeyIndex = 0; dataKeyIndex < dataKeys.length; dataKeyIndex++) {
      const dataKey = dataKeys[dataKeyIndex];
      const target = fileMap[dataKey];
      const result = await getJsonFile(path.join('data', REGION_NAME, typeof target === 'object' ? target.folder : target));
      if (dataKey === 'version' && result.id != VERSION) {
        throw Error('Outdated version: ' + result.id + ', current version: ' + VERSION);
      }
      data[dataKey] = result;
    }
    if (data.version.id != VERSION) {
      throw Error('Outdated version: ' + data.version.id + ', current version: ' + VERSION);
    }
    console.log('Successfully restored cached version in', (Date.now() - launchDate) / 1000, 'seconds');
  } catch (cacheReadError) {
    console.log('Cannot restore cached data version, building a new one, version:', VERSION);
    const startedDate = Date.now();
    const allAddresses = {};
    const allMembers = {};
    const allRoles = {};
    const allAssignedBys = {};
    const allElections = {};
    const uikMap = {};
    const allCandidates = {};
    const allParties = {};
    const districtMap = {};
    const allElectoralDistricts = {};
    const resultsByUik = { };

    const violationsMap = await fetchViolationsMap(VIOLATIONS_URL);

    const processDistrict = (district) => {
      return districtMap[district] || (districtMap[district] = {name: district, electoral_districts: {}});
    };
    const processAddress = (rawAddress, venue, optional) => {
      if (!rawAddress)
        return 0;
      const address = parseAddress(rawAddress, venue, optional);
      if (!address)
        return 0;
      addVenue(address, venue, true);
      // address_id
      return processEntry(allAddresses, address, addressToString(address.address, true), (existingEntry, newEntry) => {
        const existingVenue = asVenueName(existingEntry.related_to.venue);
        const newVenue = asVenueName(newEntry.related_to.venue);

        if (!existingEntry.location && newEntry.location) {
          existingEntry.location = newEntry.location;
        } else if (existingEntry.location && newEntry.location &&
          (existingEntry.location.latitude != newEntry.location.latitude || existingEntry.location.longitude != newEntry.location.longitude)) {
          if (!existingEntry.alternate_locations) {
            existingEntry.alternate_locations = {};
            existingEntry.alternate_locations[existingVenue] = existingEntry.location;
          }
          existingEntry.alternate_locations[newVenue] = newEntry.location;
        }

        if (Array.isArray(existingEntry.phone_number) || typeof existingEntry.phone_number === 'string') {
          const map = {};
          map[existingVenue] = existingEntry.phone_number;
          existingEntry.phone_number = map;
        } else if (!existingEntry.phone_number && newEntry.phone_number) {
          existingEntry.phone_number = {};
        }
        if (newEntry.phone_number) {
          existingEntry.phone_number[newVenue] = newEntry.phone_number;
        }

        if (typeof existingEntry.address.apartment === 'string') {
          const map = {};
          map[existingVenue] = existingEntry.address.apartment;
          existingEntry.address.apartment = map;
        } else if (!existingEntry.address.apartment && newEntry.address.apartment) {
          existingEntry.address.apartment = {};
        }
        if (newEntry.address.apartment) {
          existingEntry.address.apartment[newVenue] = newEntry.address.apartment;
        }
        addVenue(existingEntry, venue);
      });
    };
    const processRole = (rawRole, venue) => {
      const role = parseRole(rawRole);
      // role_id
      return processEntry(allRoles, role, role.toLowerCase());
    };
    const processAssignedBy = (rawAssignedBy, roleId, venue) => {
      if (!rawAssignedBy)
        return 0;
      const assignedBy = {
        name: ucfirst(rawAssignedBy)
      };
      const partyName = cleanPartyName(assignedBy.name);
      if (partyName) {
        if (partyName.toLowerCase() != assignedBy.name.toLowerCase()) {
          assignedBy.party_name = partyName;
        } else {
          let cleanAssignedBy = assignedBy.name.replace(/Территориальная избирательная комиссия/gi, 'ТИК');
          if (cleanAssignedBy.toLowerCase() != assignedBy.name.toLowerCase()) {
            assignedBy.party_name = cleanAssignedBy;
          }
        }
        const abbr = abbreviation(partyName);
        if (abbr) {
          assignedBy.party_abbreviation = abbr;
        }
      }
      assignedBy.assigned_count = 0;
      assignedBy.assigned_role_member_ids = {};
      // assigned_by_id
      return processEntry(allAssignedBys, assignedBy, rawAssignedBy.toLowerCase());
    };
    const processCandidate = (name, electoralDistrict, resultEntry, venue) => {
      let key = null;
      let candidate = null;
      if (!electoralDistrict.id) { // party
        const cleanName = cleanPartyName(name);
        key = cleanName.toLowerCase();
        candidate = {
          name: {
            abbreviation: abbreviation(cleanName),
            full: cleanName
          },
          electoral_districts: {}
        };
        candidate.electoral_districts[electoralDistrict.type] = 'parties';
        if (name != cleanName) {
          candidate.name.source = name;
        }
        let abbreviationWhiteList = [
          'ЕР', 'СР', 'КПРФ'
        ];
        if (!abbreviationWhiteList.includes(candidate.name.abbreviation)) {
          delete candidate.name.abbreviation;
        }
      } else {
        key = name.toLowerCase();
        candidate = {
          name: parseName(name, name, venue),
          gender: 'unknown',
          electoral_districts: {}
        };
        const districtData = {
          id: electoralDistrict.id
        };
        ['supported_by_smart_vote', 'supported_by_party_id', 'supported_by_party_name', 'supported_by_people'].forEach((key) => {
          if (resultEntry[key]) {
            districtData[key] = resultEntry[key];
          }
        });
        candidate.electoral_districts[electoralDistrict.type] = districtData;
        const gender = guessGender(candidate.name);
        if (!gender)
          throw Error('Unknown gender: ' + gender);
        candidate.gender = gender;
      }
      addVenue(candidate, venue);
      return processEntry(!electoralDistrict.id ? allParties : allCandidates, candidate, key, (existingEntry, entry) => {
        for (const electoralDistrictType in entry.electoral_districts) {
          const newDistrict = entry.electoral_districts[electoralDistrictType];
          const existingDistrict = existingEntry.electoral_districts[electoralDistrictType];
          if (!existingDistrict) {
            existingEntry.electoral_districts[electoralDistrictType] = newDistrict;
          } else if (existingDistrict.id !== newDistrict.id) {
            throw Error("Participating in multiple elections?");
          }
        }
      }, venue, true);
    };
    const processElection = (rawElection, venue) => {
      const election = {
        id: null,
        data_id: parseInt(rawElection.vrn),
        type: 'unknown',
        name: rawElection.name,
        date: parseDate(rawElection.date)
      };
      const regionId = parseInt(rawElection.subjCode);
      if (regionId) {
        election.region = regionId;
      }
      if (election.name.includes('Государственной Думы')) {
        election.type = 'federal';
      } else if (election.name.includes('Законодательного Собрания')) {
        election.type = 'city';
      } else if (election.name.includes('муниципальный округ')) {
        election.type = 'municipality';
      }
      const id = processEntry(allElections, election, rawElection.vrn, false, venue, true);
      election.id = id;
      return id;
    };
    const processElectoralDistrict = (rawElectoralDistrict, rootElectoralDistrictId, venue) => {
      const uik = uikMap[venue.id];
      const electoralDistrict = {
        data_id: parseInt(rawElectoralDistrict.vrn),
        id: parseInt(rawElectoralDistrict.numtvd),
        type: 'unknown',
        name:
          rawElectoralDistrict.namtvd && rawElectoralDistrict.namtvd != rawElectoralDistrict.namik ?
            rawElectoralDistrict.namtvd + (parseInt(rawElectoralDistrict.numtvd) ? ' – Округ №' + rawElectoralDistrict.numtvd : '') :
            parseInt(rawElectoralDistrict.numtvd) ? 'Округ №' + rawElectoralDistrict.numtvd :
              rawElectoralDistrict.namik.includes('муниципальный округ') ? 'М' + rawElectoralDistrict.namik.match(/(?<=м)униципальный округ.+/gi)[0] :
                'Комиссия',
        commission_name: rawElectoralDistrict.namik,
        commission_type: rawElectoralDistrict.vidtvd == 'OIK' ? 'oik' : rawElectoralDistrict.vidtvd,
        stats: {
          uik_count: uik.empty ? 0 : 1,
          koib_count: uik.has_koib ? 1 : 0,
          empty_count: uik.empty ? 1 : 0
        }
      };
      if (rawElectoralDistrict._links) {
        electoralDistrict.result_data_id = parseInt(rawElectoralDistrict._links.results.href.match(/(?<=vibory\/)\d+(?=\/)/gi)[0]);
      }
      const rootElectoralDistrict = rootElectoralDistrictId ? allElectoralDistricts.entries[rootElectoralDistrictId] : electoralDistrict;
      if (rootElectoralDistrict) {
        if (rootElectoralDistrict.name.includes('Муниципальный')) {
          electoralDistrict.type = 'municipality';
          electoralDistrict.municipality = extractMunicipalityName(rootElectoralDistrict.commission_name);
          electoralDistrict.id = electoralDistrict.municipality + (electoralDistrict.id ? '_' + electoralDistrict.id : '');
        } else if (rootElectoralDistrict.commission_name == 'Санкт-Петербургская избирательная комиссия') {
          electoralDistrict.type = 'city';
        } else if (rootElectoralDistrict.name == 'ЦИК России') {
          electoralDistrict.type = 'federal';
        } else {
          throw Error('Cannot determine type ' + JSON.stringify(rawElectoralDistrict));
        }
      } else if (rootElectoralDistrictId) {
        electoralDistrict.root_electoral_district_id = rootElectoralDistrictId;
      }
      const entry_id = processEntry(allElectoralDistricts,
        electoralDistrict,
        electoralDistrict.commission_name + '-' + electoralDistrict.data_id,
        (existingEntry, newEntry) => {
          existingEntry.stats.uik_count += newEntry.stats.uik_count;
          existingEntry.stats.koib_count += newEntry.stats.koib_count;
          existingEntry.stats.empty_count += newEntry.stats.empty_count;
        },
        venue,
        true
      );
      electoralDistrict.entry_id = entry_id;
      return entry_id;
    };
    const assignAwards = (member, venue, commission, parentCommissions, awards) => {
      const lookupName = (member.name.raw || fullName(member.name)).toLowerCase().replace(/ё/g, 'е');
      const commissionType = getVenueType(venue);
      for (const awardType in awards) {
        let scopedAwards = awards[awardType][commissionType];
        if (scopedAwards) {
          scopedAwards = scopedAwards[venue.id];
        }
        if (scopedAwards) {
          for (let i = 0; i < scopedAwards.length; i++) {
            const awardedPerson = scopedAwards[i].toLowerCase().replace(/ё/g, 'е');
            if (awardedPerson === lookupName) {
              if (!member.awards) {
                member.awards = [];
              }
              if (!member.awards.includes(awardType)) {
                member.awards.push(awardType);
                if (!commission.awards) {
                  commission.awards = {};
                }
                commission.awards[awardType] = (commission.awards[awardType] || 0) + 1;
                if (parentCommissions) {
                  parentCommissions.forEach((parentCommission) => {
                    const key = commission.type + '_awards';
                    if (!parentCommission[key])
                      parentCommission[key] = {};
                    parentCommission[key][awardType] = (parentCommission[key][awardType] || 0) + 1;
                  });
                }
              }
              scopedAwards.splice(i, 1);
              if (scopedAwards.length === 0) {
                delete awards[awardType][commissionType][venue.id];
                if (empty(awards[awardType][commissionType])) {
                  delete awards[awardType][commissionType];
                }
                if (empty(awards[awardType])){
                  delete awards[awardType];
                }
              }
              break;
            }
          }
        }
      }
    };
    const processMember = (rawMember, venue, commission, parentCommissions, district, awards) => {
      const member = parseMember(rawMember, venue, district);
      const roleId = processRole(rawMember.position, venue);
      if (roleId != 0) {
        member.role_id = roleId;
      }
      const assignedById = processAssignedBy(rawMember.vydv, roleId, venue);
      if (assignedById != 0) {
        member.assigned_by_id = assignedById;
      }
      assignAwards(member, venue, commission, parentCommissions, awards);
      // member_id
      const memberId = processEntry(allMembers, member, rawMember.fio + ' ' + rawMember.birthdate, (existing, fresh) => {
        if (existing.data_id != fresh.data_id) {
          if (!existing.other_data_ids)
            existing.other_data_ids = [];
          existing.other_data_ids.push(fresh.data_id);
        }
        if (existing.awards && fresh.awards) {
          exsiting.awards = existing.awards.join(fresh.awards);
        } else if (fresh.awards) {
          existing.awards = fresh.awards;
        }
      }, venue);

      if (assignedById != 0 && roleId != 0) {
        let assignedMemberIds = allAssignedBys.entries[assignedById].assigned_role_member_ids[roleId];
        if (!assignedMemberIds) {
          assignedMemberIds = [];
          allAssignedBys.entries[assignedById].assigned_role_member_ids[roleId] = assignedMemberIds;
        }
        if (!assignedMemberIds.includes(memberId)) {
          assignedMemberIds.push(memberId);
          allAssignedBys.entries[assignedById].assigned_count++;
        }
      }

      member.id = memberId;

      return memberId;
    };
    const addTurnout = (protocol, turnout, isLast) => {
      if (empty(turnout)) {
        protocol.metadata.missing_turnout_protocol_count = (protocol.metadata.missing_turnout_protocol_count || 0) + 1;
        if (!isLast) {
          return;
        }
      }
      if (isLast) {
        const target = turnout['19.09.2021'] || (turnout['19.09.2021'] = {});
        if (target && !target['20.00'] && !protocol.empty) {
          target['20.00'] = {
            percentage: protocol.official_result.turnout.percentage,
            count: protocol.official_result.turnout.count,
            registered_count: protocol.metadata.voters.registered_count
          };
        }
      }
      if (empty(turnout)) {
        return;
      }

      const target = protocol.turnout_protocols;
      const cache = {};
      const prevDates = Object.keys(target);
      for (const date in turnout) {
        if (!turnout[date]) {
          protocol.metadata.invalid_turnout_protocol_count = (protocol.metadata.invalid_turnout_protocol_count || 0) + 1;
          continue;
        }
        for (const time in turnout[date]) {
          const turnoutItem = turnout[date][time];
          if (turnoutItem.percentage && turnoutItem.count === undefined) {
            let registeredCount = 0;
            if (!registeredCount) {
              for (let i = prevDates.length - 1; i >= 0 && !registeredCount; i--) {
                const prev = target[prevDates[i]];
                if (!prev)
                  continue;
                const prevTimes = Object.keys(prev);
                for (let j = prevTimes.length - 1; j >= 0 && !registeredCount; j--) {
                  const prevItem = target[prevDates[i]][prevTimes[j]];
                  if (prevItem && prevItem.regsitered_count) {
                    registeredCount = prevItem.regsitered_count;
                    break;
                  }
                }
              }
            }
            if (!registeredCount && !protocol.empty) {
              registeredCount = (!isLast ? protocol.metadata.voters.initially_registered_count : 0) || protocol.metadata.voters.registered_count;
            }
            if (registeredCount) {
              turnoutItem.count = Math.round(registeredCount * (turnoutItem.percentage / 100.0));
            }
          }
          for (const dataKey in turnoutItem) {
            const currentValue = {date, time, value: turnoutItem[dataKey]};
            let prevValue = cache[dataKey];
            if (!prevValue) {
              for (let i = prevDates.length - 1; i >= 0 && !prevValue; i--) {
                const prevTurnoutDate = target[prevDates[i]];
                if (!prevTurnoutDate) // no data for protocol
                  continue;
                const prevTimes = Object.keys(prevTurnoutDate);
                for (let j = prevTimes.length - 1; j >= 0; j--) {
                  const prevItem = prevTurnoutDate[prevTimes[j]][dataKey];
                  if (typeof prevItem === 'number') {
                    cache[dataKey] = prevValue = {date: prevDates[i], time: prevTimes[j], value: prevItem};
                    break;
                  }
                }
              }
            }
            const delta = currentValue.value - (prevValue ? prevValue.value : 0);
            const timeDeltaMinutes = parseTimeDeltaMinutes(!prevValue || prevValue.date !== currentValue.date ? '08.00' : prevValue.time, currentValue.time);
            /*if (time === '10.00' && prevValue && prevValue.time === '20.00' && delta !== 0) {
              if (!protocol.metadata.analysis) {
                protocol.metadata.analysis = {};
              }
              protocol.metadata.analysis['overnight_turnout_' + dataKey + '_change_count'] = (protocol.metadata.overnight_turnout_change_count || 0) + 1;
              if (delta > 0) {
                protocol.metadata.analysis['overnight_turnout_' + dataKey + '_added'] = delta;
              } else {
                protocol.metadata.analysis['overnight_turnout_' + dataKey + '_removed'] = -delta;
              }
              if (dataKey === 'count' || dataKey === 'percentage') {
                turnoutItem.overnight_changes = true;
              } else {
                turnoutItem.overnight_registry_changes = true;
              }
            }*/
            if (delta < 0) {
              if (!protocol.metadata.analysis) {
                protocol.metadata.analysis = {};
              }
              protocol.metadata.analysis['negative_turnout_' + dataKey + '_protocols'] = (protocol.metadata['negative_turnout_' + dataKey + '_protocols'] || 0) + 1;
              protocol.metadata.analysis['negative_turnout_' + dataKey] = (protocol.metadata['negative_turnout_' + dataKey] || 0) + (-delta);
            }
            turnout[date][time][dataKey + '_delta'] = delta;
            if (timeDeltaMinutes) {
              turnout[date][time][dataKey + '_delta_per_minute'] = delta / timeDeltaMinutes;
              turnout[date][time][dataKey + '_delta_per_hour'] = delta / (timeDeltaMinutes / 60);
            }
            cache[dataKey] = currentValue;
          }
          turnout[date][time] = sortKeys(turnout[date][time], null, (a, b) => a < b ? -1 : a > b ? 1 : 0);
        }
      }
      Object.assign(target, turnout);
    };
    const addProtocol = (uik, tik, gik, result, electoralDistrict, election) => {
      const output = (resultsByUik[uik.id] || (resultsByUik[uik.id] = {}))[election.type] || (resultsByUik[uik.id][election.type] = {});
      const outputKey = electoralDistrict.id ? 'person_' + electoralDistrict.id : 'parties';
      if (output[outputKey])
        throw Error('result[' + uik.id + '][' + election.id + '][' + outputKey + '] already exists');
      output[outputKey] = result;
      if (electoralDistrict.id) {
        if (uik.electoral_districts[election.type] &&
          uik.electoral_districts[election.type] != electoralDistrict.id) {
          throw Error();
        }
        if (election.type === 'municipality') {
          const args = electoralDistrict.id.split('_');
          const municipality = args[0];
          const id = args[1];
          [uik, tik, gik].forEach((target) => {
            if (!target.electoral_districts[election.type]) {
              target.electoral_districts[election.type] = {};
            }
            addOrSet(target.electoral_districts[election.type], municipality, parseInt(id));
          });
        } else {
          [uik, tik, gik].forEach((target) => {
            addOrSet(target.electoral_districts, election.type, parseInt(electoralDistrict.id));
          });
        }
        [tik, gik].forEach((group) => {
          const uiksByDistrict = group.uiks_by_electoral_district[election.type] || (group.uiks_by_electoral_district[election.type] = {});
          if (addOrSet(uiksByDistrict, electoralDistrict.id, uik.id) && uiksByDistrict[electoralDistrict.id] === uik.id) {
            if (electoralDistrict.type == 'municipality' && electoralDistrict.id.includes('_')) {
              const municipality = electoralDistrict.id.split('_')[0];
              const output = group.stats.electoral_districts_count[election.type] || (group.stats.electoral_districts_count[election.type] = {});
              output[municipality] = (output[municipality] || 0) + 1;
            } else {
              group.stats.electoral_districts_count[election.type] = (group.stats.electoral_districts_count[election.type] || 0) + 1;
            }
          }
        });
      }

      if (!result.empty) {
        if (electoralDistrict.id) {
          [uik, tik, gik].forEach((target) => {
            const candidatesCount = target.stats.candidates_count[electoralDistrict.type] || (target.stats.candidates_count[electoralDistrict.type] = {total_count: 0, winner_count: 0});
            if (electoralDistrict.type === 'municipality') {
              const args = electoralDistrict.id.split('_');
              const municipality = args[0];
              const id = args[1];
              const municipalityCandidatesCount = candidatesCount[municipality] || (candidatesCount[municipality] = {total_count: 0, winner_count: 0});
              if (!municipalityCandidatesCount[id]) {
                candidatesCount.total_count += result.entries.length;
                candidatesCount.winner_count += getWinnerCount(electoralDistrict.type);
                municipalityCandidatesCount.total_count += result.entries.length;
                municipalityCandidatesCount.winner_count += getWinnerCount(electoralDistrict.type);
                municipalityCandidatesCount[id] = result.entries.length;
              } else if (municipalityCandidatesCount[id] !== result.entries.length) {
                throw Error(municipalityCandidatesCount[id] + ' vs ' + result.entries.length);
              }
            } else if (!candidatesCount[electoralDistrict.id]) {
              candidatesCount.total_count += result.entries.length;
              candidatesCount.winner_count += getWinnerCount(electoralDistrict.type);
              candidatesCount[electoralDistrict.id] = result.entries.length;
            } else if (candidatesCount[electoralDistrict.id] !== result.entries.length) {
              throw Error(candidatesCount[electoralDistrict.id] + ' vs ' + result.entries.length);
            }
          });
        } else {
          [uik, tik, gik].forEach((target) => {
            if (!target.stats.parties_count[electoralDistrict.type]) {
              target.stats.parties_count[electoralDistrict.type] = result.entries.length;
            } else if (target.stats.parties_count[electoralDistrict.type] != result.entries.length) {
              throw Error(target.stats.parties_count[electoralDistrict.type] + ' vs ' + result.entries.length);
            }
          });
        }
      }
    };
    const validateChecksum = (protocol) => {
      if (protocol.empty)
        return;

      // http://www.cikrf.ru/law/federal_law/zakon_51/gl11.php
      const receivedCount = protocol.metadata.papers.received_count /*строка 2*/;
      const checkCount =
        protocol.metadata.voters.ahead_of_time_count /*строка 3*/ +
        protocol.metadata.voters.walk_by_count /*строка 4*/ +
        protocol.metadata.voters.on_home_count /*строка 5*/ +
        protocol.metadata.papers.destroyed_count /*строка 6*/;

      if (receivedCount === checkCount) {
        protocol.metadata.analysis.checksum_valid = 1;
      } else {
        protocol.metadata.analysis.checksum_invalid = 1;
        if (receivedCount > checkCount) {
          const count = receivedCount - checkCount;
          if (protocol.metadata.papers.lost_count !== count || protocol.metadata.papers.ignored_count) {
            protocol.metadata.analysis.invalid_protocol_count = 1;
          }
        } else {
          const count = checkCount - receivedCount;
          if (protocol.metadata.papers.ignored_count !== count || protocol.metadata.papers.lost_count) {
            protocol.metadata.analysis.invalid_protocol_count = 1;
          }
        }
      }
    };
    const addMember = (target, memberId, sourceDate) => {
      if (!target.members) {
        target.members = {
          chairman_id: null,
          vice_chairman_id: null,
          secretary_id: null,
          other_ids: null,
          assigned_by_stats: {},
          gender_stats: {},
          age_stats: {},
          source_date: sourceDate
        };
      }
      const member = allMembers.entries[memberId];
      const roleId = member.role_id;
      const role = allRoles.entries[roleId];
      const roleKey = getRoleKey(role);
      const roleIdKey = roleKey === 'other' ? roleKey + '_ids' : roleKey + '_id';
      if (roleIdKey !== 'other_ids' && target.members[roleIdKey]) {
        throw Error(role + ' is already vacant!');
      }
      addOrSet(target.members, roleIdKey, memberId);
      if (roleKey === 'other') {
        const assignedById = member.assigned_by_id || 0;
        target.members.assigned_by_stats[assignedById] = (target.members.assigned_by_stats[assignedById] || 0) + 1;
      }
      if (member.gender) {
        target.members.gender_stats[member.gender] = (target.members.gender_stats[member.gender] || 0) + 1;
      }
      if (member.age) {
        target.members.age_stats[member.age] = (target.members.age_stats[member.age] || 0) + 1;
      }
    };
    const gikRaw = (await getJsonFile(
      path.join('data-raw', REGION_NAME, 'gik-to-tik.json'),
      'http://' + IZBIRKOM_HOST + '/region/' + REGION_NAME + '/?action=ikTree&region=' + REGION_CODE,
      true
    )).response[0];
    const gik = {
      name: gikRaw.text,
      id: 'СПбИК',
      type: 'gik',
      data_id: parseInt(gikRaw.id),
      districts: null,
      electoral_districts: {},
      stats: {
        district_count: null,
        parties_count: {},
        candidates_count: {},
        electoral_districts_count: {},
        tik_count: 0,
        uik_count: 0,
        koib_count: 0,
        empty_uik_count: 0,
        empty_koib_count: 0,
        turnout_protocol_count: 0,
        protocol_count: 0,
        empty_protocol_count: 0
      },
      uik_analysis: {},
      uiks_by_electoral_district: {}
    };
    const gikVenue = {type: 'ГИК', id: gik.id, data_id: gik.data_id};
    const gikInfoRaw = (await getJsonFile(
      path.join('data-raw', REGION_NAME, 'gik', 'info.json'),
      COMMITTEE_URL + '/' + gik.data_id,
      true
    )).response;

    const gikAddressId = processAddress(gikInfoRaw.address, gikVenue);
    if (gikAddressId != 0)
      gik.address_id = gikAddressId;
    const gikMembersRaw = (await getJsonFile(
      path.join('data-raw', REGION_NAME, 'gik', 'members.json'),
      COMMITTEE_URL + '/' + gik.data_id + '/members',
      true
    ));
    gikMembersRaw.response.forEach((memberRaw) => {
      const memberId = processMember(memberRaw, gikVenue, gik, null, allAddresses.entries[gikAddressId].address.district, awards);
      if (memberId) {
        addMember(gik, memberId, gikMembersRaw.date);
      }
    });

    const gikElectionsRaw = (await getJsonFile(
      path.join('data-raw', REGION_NAME, 'gik', 'elections.json'),
      'http://cikrf.ru/iservices/voter-services/vibory/committee/' + gik.data_id,
      true
    )).response;
    gikElectionsRaw.forEach((electionRaw) => {
      const electionId = processElection(electionRaw, gikVenue);
      if (electionId) {
        if (!gik.election_ids) {
          gik.election_ids = [];
        }
        gik.election_ids.push(electionId);
      }
    });

    const newUik = (uikRaw, tik, tikVenue, uikInfoRaw, uikMembersRaw, isUnknown) => {
      const uik = {
        name: uikRaw.text.replace(/(?<=№)\s+/gi, ''),
        id: parseInt(uikRaw.text.match(/\d+$/gi)[0]),
        type: 'uik',
        data_id: parseInt(uikRaw.id),
        has_koib: null,
        abroad: null,
        unknown: null,
        district: null,
        electoral_districts: {},
        stats: {
          parties_count: {},
          candidates_count: {},
          protocol_count: 0,
          empty_protocol_count: 0,
          turnout_protocol_count: 0,
          ballot_count: null
        },
        analysis: {},
        parent_commission: {
          type: tik.type,
          id: tik.id,
          parent_commission: tik.parent_commission
        }
      };
      uik.has_koib = koibMap[uik.id] || false;
      const uikVenue = newUikVenue(uik, tikVenue);

      if (tik.uiks[uik.id])
        throw Error('УИК №' + uik.id + ' уже был найден.');
      tik.uiks[uik.id] = uik;
      uikMap[uik.id] = uik;

      if (!empty(uikInfoRaw)) {
        const addressId = processAddress(uikInfoRaw.address, uikVenue);
        if (addressId != 0) {
          uik.address_id = addressId;
        }
        const votingAddressId = processAddress(uikInfoRaw.votingAddress, uikVenue);
        if (votingAddressId != 0 && votingAddressId != addressId) {
          uik.voting_address_id = votingAddressId;
        }
      }

      const address = allAddresses.entries[uik.address_id || uik.voting_address_id];
      if (address && address.address && (address.abroad || address.address.district)) {
        uik.district = uikVenue.district = (address.abroad ? abroadKey(address) : address.address.district);
      }

      if (address && address.abroad) {
        uik.abroad = true;
        delete uik.unknown;
      } else {
        delete uik.abroad;
        if (isUnknown) {
          uik.unknown = true;
        } else {
          delete uik.unknown;
        }
      }

      if (!uik.district && tik.district) {
        uik.district = uikVenue.district = tik.district;
      } else if (!uik.district) {
        throw Error('Unknown district: ' + toJson(uik));
      }

      addVenue(processDistrict(uik.district), uikVenue, true);

      if (uikMembersRaw && uikMembersRaw.response.length > 0) {
        uikMembersRaw.response.forEach((memberRaw) => {
          const memberId = processMember(memberRaw, uikVenue, uik, [tik, gik], uik.district, awards);
          if (memberId) {
            addMember(uik, memberId, uikMembersRaw.date);
          }
        });
      }

      return uik;
    };

    const newUikVenue = (uik, tikVenue) => {
      return {type: 'УИК', id: uik.id, data_id: uik.data_id, has_koib: uik.has_koib, district: uik.district, parent: tikVenue};
    }

    const uikStaticMetadataMap = {};
    const unknownUiksMap = {};

    gik.tiks = { };
    for (let tikIndex = 0; tikIndex < gikRaw.children.length; tikIndex++) {
      const tikRaw = gikRaw.children[tikIndex];
      const tik = {
        name: tikRaw.text.replace(/(?<=№)\s+/gi, ''),
        type: 'tik',
        id: parseInt(tikRaw.text.match(/\d+$/gi)[0]),
        data_id: parseInt(tikRaw.id),
        address_id: 0,
        district: null,
        districts: null,
        electoral_districts: {},
        stats: {
          uik_count: 0,
          koib_count: 0,
          empty_uik_count: 0,
          empty_koib_count: 0,
          district_count: null,
          parties_count: {},
          candidates_count: {},
          electoral_districts_count: {},
          protocol_count: 0,
          empty_protocol_count: 0,
          turnout_protocol_count: 0,
          ballot_count: null,
        },
        uik_analysis: {},
        uiks_by_electoral_district: {},
        uiks: tikRaw.children ? {} : null,
        parent_commission: {
          type: gik.type,
          id: gik.id
        }
      };
      if (gik.tiks[tik.id])
        throw Error('ТИК №' + tik.id + ' уже был найден.'); // TODO tik
      gik.tiks[tik.id] = tik;
      gik.stats.tik_count++;
      const tikVenue = {type: 'ТИК', id: tik.id, data_id: tik.data_id, parent: gikVenue};
      const tikInfoRaw = (await getJsonFile(
        path.join('data-raw', REGION_NAME, 'tik', tik.id.toString(), 'info.json'),
        COMMITTEE_URL + '/' + tik.data_id,
        true
      )).response;
      const tikAddressId = processAddress(tikInfoRaw.address, tikVenue);
      if (tikAddressId) {
        tik.address_id = tikAddressId;
      }
      const tikVotingAddressId = processAddress(tikInfoRaw.votingAddress, tikVenue, true);
      if (tikVotingAddressId && tikAddressId != tikVotingAddressId) {
        tik.voting_address_id = tikVotingAddressId;
      }

      if (!tikAddressId && !tikVotingAddressId)
        throw Error(toJson(tikInfoRaw));

      tik.district = tikVenue.district = allAddresses.entries[tikAddressId || tikVotingAddressId].address.district;
      addVenue(processDistrict(tik.district), tikVenue, true);
      if (!tik.district)
        throw Error(toJson(tikVenue));

      const tikMembersRaw = (await getJsonFile(
        path.join('data-raw', REGION_NAME, 'tik', tik.id.toString(), 'members.json'),
        COMMITTEE_URL + '/' + tik.data_id + '/members',
        true
      ));
      tikMembersRaw.response.forEach((memberRaw) => {
        const memberId = processMember(memberRaw, tikVenue, tik, [gik], tik.district, awards);
        if (memberId) {
          addMember(tik, memberId, tikMembersRaw.date);
        }
      });

      // registered_count when started

      if (tik.uiks) {
        const uikListRaw = (await getJsonFile(
          path.join('data-raw', REGION_NAME, 'tik-to-uik', tik.id + '.json'),
          'http://' + IZBIRKOM_HOST + '/region/' + REGION_NAME + '/?action=ikTree&region=' + REGION_CODE +
          '&vrn=' + tik.data_id + '&onlyChildren=true&id=' + tik.data_id,
          true
        )).response;
        uikListRaw.sort((a, b) => parseInt(a.text.match(/\d+$/gi)[0]) - parseInt(b.text.match(/\d+$/gi)[0]));
        for (let uikIndex = 0; uikIndex < uikListRaw.length; uikIndex++) {
          const uikRaw = uikListRaw[uikIndex];
          const uikId = parseInt(uikRaw.text.match(/\d+$/g)[0]);

          const uikInfoRaw = (await getJsonFile(
            path.join('data-raw', REGION_NAME, 'uik', uikId.toString(), 'info.json'),
            COMMITTEE_URL + '/' + uikRaw.id,
            true
          )).response;
          const uikMembersRaw = (await getJsonFile(
            path.join('data-raw', REGION_NAME, 'uik', uikId.toString(), 'members.json'),
            COMMITTEE_URL + '/' + uikRaw.id + '/members',
            true
          ));

          const uik = newUik(uikRaw, tik, tikVenue, uikInfoRaw, uikMembersRaw);
          const uikVenue = newUikVenue(uik, tikVenue);

          const uikElectionsRaw = (await getJsonFile(
            path.join('data-raw', REGION_NAME, 'uik', uikId.toString(), 'elections.json'),
            'http://cikrf.ru/iservices/voter-services/vibory/committee/' + uik.data_id,
            true
          )).response;
          uikElectionsRaw.forEach((electionRaw) => {
            const electionId = processElection(electionRaw, uikVenue);
            if (electionId) {
              if (!uik.election_ids) {
                uik.election_ids = [];
              }
              uik.election_ids.push(electionId);
              if (!gik.election_ids.includes(electionId)) {
                console.log(gikVenue.id, 'does not mention election', electionId, 'held in UIK', uikVenue.id, 'with name:', allElections.entries[electionId].name);
                gik.election_ids.push(electionId);
              }
            }
          });

          const resultsUrls = {};
          const createdFiles = [];

          for (let electionIdIndex = 0; electionIdIndex < uik.election_ids.length; electionIdIndex++) {
            const electionId = uik.election_ids[electionIdIndex];
            const election = allElections.entries[electionId];
            if (!election.type)
              throw Error('type is missing: ' + JSON.stringify(election));
            const electoralDistrictFile = 'electoral_districts_' + election.type + '_' + election.data_id + '.json';
            createdFiles.push(electoralDistrictFile);
            const rawElectoralDistricts = (await getJsonFile(
              path.join('data-raw', REGION_NAME, 'uik', uik.id.toString(), electoralDistrictFile),
              'http://cikrf.ru/iservices/sgo-visual-rest/vibory/' + election.data_id + '/tvd/?vrnkomis=' + uik.data_id,
              true
            )).response._embedded.tvdDtoList;
            let rootElectoralDistrictId = 0;
            for (let electoralDistrictIndex = 0; electoralDistrictIndex < rawElectoralDistricts.length; electoralDistrictIndex++) {
              const rawElectoralDistrict = rawElectoralDistricts[electoralDistrictIndex];
              if (rawElectoralDistrict._links && rawElectoralDistrict._links['results.uik']) {
                const resultsUrl = rawElectoralDistrict._links['results.uik'].href;
                const electoralDistrictId = processElectoralDistrict(rawElectoralDistrict, rootElectoralDistrictId, uikVenue);
                if (rawElectoralDistrict.vidtvd == 'ROOT') {
                  rootElectoralDistrictId = electoralDistrictId;
                }
                const electoralDistrict = allElectoralDistricts.entries[electoralDistrictId];
                if (!electoralDistrict.type)
                  throw Error('type is missing: ' + JSON.stringify(electoralDistrict));
                addOrSet(processDistrict(uik.district).electoral_districts, electoralDistrict.type, electoralDistrict.id || 'parties');

                if (electoralDistrict.id && !uikStaticMetadataMap[electoralDistrict.type + '_' + uik.id]) {
                  // Initial protocols.
                  const oiksListDocument = (await getHtmlFile(
                    path.join('data-raw', REGION_NAME, 'registered_voters', electoralDistrict.type + '_' + electoralDistrict.id, electoralDistrict.data_id + '.json'),
                    'http://' + IZBIRKOM_HOST + '/region/izbirkom?action=show&type=238&tvd=' + electoralDistrict.data_id,
                    true
                  )).document;
                  const oikList = parseDataTableRows3(oiksListDocument, uik, electoralDistrict.type, electoralDistrict.id);
                  for (let oikMetadataIndex = 0; oikMetadataIndex < oikList.items.length; oikMetadataIndex++) {
                    const oikItem = oikList.items[oikMetadataIndex];
                    const uiksListDocument = (await getHtmlFile(
                      path.join('data-raw', REGION_NAME, 'registered_voters', electoralDistrict.type + '_' + electoralDistrict.id, oikItem.commission_id.toString(), oikItem.vibid + '.json'),
                      'http://' + IZBIRKOM_HOST + '/region/izbirkom?action=show&type=238&tvd=' + oikItem.vibid,
                      true
                    )).document;
                    const uikVotersList = parseDataTableRows3(uiksListDocument, uik, electoralDistrict.type, electoralDistrict.id);
                    if (!uikVotersList)
                      continue;
                    for (let uikMetadataIndex = 0; uikMetadataIndex < uikVotersList.items.length; uikMetadataIndex++) {
                      const uikItem = uikVotersList.items[uikMetadataIndex];
                      const targetObj = uikStaticMetadataMap[electoralDistrict.type + '_' + uikItem.commission_id] || (uikStaticMetadataMap[electoralDistrict.type + '_' + uikItem.commission_id] = {});
                      const targetVoters = targetObj.voters || (targetObj.voters = {});
                      targetVoters.initially_registered_count = uikItem.registered_voters_count;
                    }

                    const fullUikList = (await getJsonFile(
                      path.join('data-raw', REGION_NAME, 'uik-list', electoralDistrict.type + '_' + electoralDistrict.id, oikItem.commission_id.toString(), electoralDistrict.data_id + '.json'),
                      'http://' + IZBIRKOM_HOST + '/region/izbirkom?action=tvdTree&tvdchildren=true&vrn=' + election.data_id + '&tvd=' + oikItem.vibid,
                      true
                    )).response;

                    if (fullUikList.length) {
                      if (!unknownUiksMap[oikItem.commission_id])
                        unknownUiksMap[oikItem.commission_id] = {};
                      fullUikList.forEach((rawUikInfo) => {
                        if (!rawUikInfo.isUik)
                          throw Error(toJson(rawUikInfo));
                        const uikId = parseInt(rawUikInfo.text.match(/(?<=№)\d+/g)[0]);
                        let targetObj = unknownUiksMap[oikItem.commission_id][uikId] || (unknownUiksMap[oikItem.commission_id][uikId] = {uik: rawUikInfo, elections: {}, electoral_districts: {}});
                        targetObj.elections[electoralDistrict.type + '_' + electoralDistrict.id] = {
                          election_data_id: election.data_id,
                          election_id: election.id,
                          tik_data_id: oikItem.vibid,
                          commission_data_id: rawUikInfo.id,
                          electoral_district_id: electoralDistrict.entry_id,
                          electoral_district_data_id: electoralDistrict.data_id
                        };
                        if (electoralDistrict.municipality) {
                          targetObj.electoral_districts[electoralDistrict.type] = {};
                          targetObj.electoral_districts[electoralDistrict.type][electoralDistrict.municipality] = electoralDistrict.id;
                        } else {
                          targetObj.electoral_districts[electoralDistrict.type] = electoralDistrict.id;
                        }
                      });
                    }
                  }
                }

                // Results

                resultsUrls[electoralDistrictId] = {
                  url: resultsUrl,
                  election_id: electionId
                };
              } else if (rawElectoralDistrict.vidtvd == 'ROOT') {
                rootElectoralDistrictId = processElectoralDistrict(rawElectoralDistrict, 0, uikVenue);
              }
            }
          }

          for (const electoralDistrictId in resultsUrls) {
            const data = resultsUrls[electoralDistrictId];

            const electoralDistrict = allElectoralDistricts.entries[electoralDistrictId];
            const election = allElections.entries[data.election_id];
            const resultsUrl = data.url;

            const resultsFile = 'results_' + electoralDistrict.type + '_' + (electoralDistrict.id ? 'person_' + electoralDistrict.id : 'parties') + '_' + election.data_id + '.json';
            createdFiles.push(resultsFile);

            const resultsRaw = (await getJsonFile(
              path.join('data-raw', REGION_NAME, 'uik', uik.id.toString(), resultsFile),
              resultsUrl,
              true
            )).response;
            if (unknownUiksMap[tik.id] && unknownUiksMap[tik.id][uik.id]) {
              const key = electoralDistrict.type + '_' + electoralDistrict.id;
              delete unknownUiksMap[tik.id][uik.id].elections[key];
              if (empty(unknownUiksMap[tik.id][uik.id].elections)) {
                delete unknownUiksMap[tik.id][uik.id];
              }
              if (empty(unknownUiksMap[tik.id])) {
                delete unknownUiksMap[tik.id];
              }
            }
            const ballotDataId = parseInt(resultsUrl.match(/(?<=\/results\/)\d+(?=\/)/gi)[0]);
            const result = parseResult(resultsRaw, ballotDataId, electoralDistrict, processCandidate, allCandidates, allParties, smartCandidates, uikVenue, uikStaticMetadataMap[electoralDistrict.type + '_' + uik.id]);

            if (electoralDistrict.type == 'federal') {
              // Fetch attached_voters_count
              const attachedVotersDocument = (await getHtmlFile(
                path.join('data-raw', REGION_NAME, 'uik', uik.id.toString(), 'voters_attached_' + electoralDistrict.type + '_' + result.ballot_data_id + '.json'),
                'http://' + IZBIRKOM_HOST + '/region/izbirkom?action=show&type=471&tvd=' + result.ballot_data_id
              )).document;
              // Fetch detached_voters_count
              const detachedVotersDocument = (await getHtmlFile(
                path.join('data-raw', REGION_NAME, 'uik', uik.id.toString(), 'voters_detached_' + electoralDistrict.type + '_' + result.ballot_data_id + '.json'),
                'http://' + IZBIRKOM_HOST + '/region/izbirkom?action=show&type=472&tvd=' + result.ballot_data_id
              )).document;

              parseDataTableRows(attachedVotersDocument, uik, electoralDistrict.type, electoralDistrict.id, result);
              parseDataTableRows(detachedVotersDocument, uik, electoralDistrict.type, electoralDistrict.id, result);

              const days = [
                {id: 17, type: 654, param: 'tvd=0&vibid'},
                {id: 18, type: 655, param: 'tvd=0&vibid'},
                {id: 19, type: 453, param: 'tvd=0&vibid'}
              ];

              for (let i = 0; i < days.length; i++) {
                const day = days[i];
                const turnoutDocument = (await getHtmlFile(
                  path.join('data-raw', REGION_NAME, 'uik', uik.id.toString(), 'voters_turnout_' + day.id + '_' + electoralDistrict.type + '_' + result.ballot_data_id + '.json'),
                  'http://' + IZBIRKOM_HOST + '/region/izbirkom?action=show&type=' + day.type + '&' + day.param + '=' + result.ballot_data_id
                )).document;

                const turnoutRaw = parseDataTableRows2(turnoutDocument, uik, electoralDistrict.type, electoralDistrict.id);
                addTurnout(result, turnoutRaw, i === days.length - 1);
                if (turnoutRaw) {
                  uik.stats.turnout_protocol_count++;
                }
              }
            } else if (electoralDistrict.type === 'city') {
              const days = [
                {id: 17, type: 656, param: 'tvd'},
                {id: 18, type: 657, param: 'tvd'},
                {id: 19, type: 454, param: 'tvd=0&vibid'}
              ];
              const turnoutDocuments = [];
              for (let i = 0; i < days.length; i++) {
                const day = days[i];
                turnoutDocuments.push(getHtmlFile(
                  path.join('data-raw', REGION_NAME, 'uik', uik.id.toString(), 'voters_turnout_' + day.id + '_' + electoralDistrict.type + '_' + result.ballot_data_id + '.json'),
                  'http://' + IZBIRKOM_HOST + '/region/izbirkom?action=show&' + day.param + '=' + result.ballot_data_id + '&type=' + day.type
                ));
              }
              for (let i = 0; i < turnoutDocuments.length; i++) {
                const turnoutDocument = (await turnoutDocuments[i]).document;
                const turnoutRaw = parseDataTableRows2(turnoutDocument, uik, electoralDistrict.type, electoralDistrict.id);
                addTurnout(result, turnoutRaw, i === days.length - 1);
                if (turnoutRaw) {
                  uik.stats.turnout_protocol_count++;
                }
              }
            }

            addProtocol(uik, tik, gik, result, electoralDistrict, election);
          }

          tik.stats.turnout_protocol_count += uik.stats.turnout_protocol_count;
          gik.stats.turnout_protocol_count += uik.stats.turnout_protocol_count;

          // TODO: run when --clean is set
          /*if (false) {
            fs.readdir('data/' + REGION_NAME + '/raw/uik/' + uik.id, (err, files) => {
              if (err) {
                throw err;
              }
              files
                .filter((file) => (file.startsWith('electoral_districts_') || file.startsWith('results_')) && !createdFiles.includes(file))
                .forEach((file) => fs.unlink('data/' + REGION_NAME + '/raw/uik/' + uik.id + '/' + file, (err) => console.log(err)));
            });
          }*/
        }
      }
    }

    if (!empty(unknownUiksMap)) {
      let unknownUikCount = 0;
      for (const tikId in unknownUiksMap) {
        const uiks = unknownUiksMap[tikId];
        const count = countKeys(uiks);
        console.log.apply(console, [count, 'unknown', tikId, 'uiks:'].concat(Object.keys(uiks).map((uikId) => parseInt(uikId))));
        unknownUikCount += count;
      }
      console.log(unknownUikCount, 'unknown uiks total');

      for (const tikId in unknownUiksMap) {
        const tik = gik.tiks[tikId];
        const tikVenue = {type: 'ТИК', id: tik.id, data_id: tik.data_id, parent: gikVenue};

        for (const uikId in unknownUiksMap[tikId]) {
          const uikRawInfo = unknownUiksMap[tikId][uikId];
          const uikRaw = uikRawInfo.uik;

          let uikInfoRaw;
          try {
            if (uikId >= 8000) { // Abroad
              uikInfoRaw = (await getJsonFile(
                path.join('data-raw', REGION_NAME, 'restored-uik', tikId.toString(), uikId.toString(), 'info-99.json'),
                'http://www.cikrf.ru/iservices/voter-services/committee/subjcode/99/num/' + uikId,
                true
              )).response;
            } else {
              uikInfoRaw = (await getJsonFile(
                path.join('data-raw', REGION_NAME, 'restored-uik', tikId.toString(), uikId.toString(), 'info-' + REGION_CODE + '.json'),
                'http://www.cikrf.ru/iservices/voter-services/committee/subjcode/' + REGION_CODE + '/num/' + uikId,
                true
              )).response;
            }
          } catch (e) {
            console.log('info-XX.json fetch failed for UIK', uikId, 'under TIK', tikId);
          }
          if (empty(uikInfoRaw)) {
            try {
              uikInfoRaw = (await getJsonFile(
                path.join('data-raw', REGION_NAME, 'restored-uik', tikId.toString(), uikId.toString(), 'info.json'),
                'http://www.cikrf.ru/iservices/voter-services/vibory/committee/' + uikRaw.id,
                true
              )).response;
            } catch (e) {
              console.log('info.json fetch failed for UIK', uikId, 'under TIK', tikId);
            }
          }

          let uikMembersRaw;
          try {
            uikMembersRaw = (await getJsonFile(
              path.join('data-raw', REGION_NAME, 'restored-uik', tikId.toString(), uikId.toString(), 'members.json'),
              'http://www.cikrf.ru/iservices/voter-services/vibory/committee/' + uikRaw.id + '/members',
              true, true
            ));
          } catch (e) {
            console.log('members.json fetch failed for UIK', uikId, 'under TIK', tikId);
          }
          if (empty(uikMembersRaw)) {
            try {
              const membersDocument = (await getHtmlFile(
                path.join('data-raw', REGION_NAME, 'restored-uik', tikId.toString(), uikId.toString(), 'members-backup.json'),
                'http://www.' + REGION_NAME + '.vybory.izbirkom.ru/' + REGION_NAME + '/ik_r/' + uikId.toString()
              )).response;
              // TODO
            } catch (e) {
              console.log('members.html fetch failed for UIK', uikId, 'under TIK', tikId);
            }
          }

          const uik = newUik(uikRaw, tik, tikVenue, uikInfoRaw, uikMembersRaw, true);
          Object.assign(uik.electoral_districts, uikRawInfo.electoral_districts);
          const uikVenue = newUikVenue(uik, tikVenue);

          for (const electionKey in uikRawInfo.elections) {
            const electionInfo = uikRawInfo.elections[electionKey];
            const election = allElections.entries[electionInfo.election_id];
            const electoralDistrict = allElectoralDistricts.entries[electionInfo.electoral_district_id];

            let partiesElectoralDistrict = null;
            for (const electoralDistrictId in allElectoralDistricts.entries) {
              const entry = allElectoralDistricts.entries[electoralDistrictId];
              if (!entry.id && entry.type === electoralDistrict.type) {
                partiesElectoralDistrict = entry;
                break;
              }
            }
            if (electoralDistrict.type === 'federal' || electoralDistrict.type === 'city') {
              addOrSet(processDistrict(uik.district).electoral_districts, electoralDistrict.type, 'parties');
            }
            addOrSet(processDistrict(uik.district).electoral_districts, electoralDistrict.type, electoralDistrict.id);

            if (!uik.election_ids) {
              uik.election_ids = [];
            }
            uik.election_ids.push(election.id);

            const reports = (electoralDistrict.type === 'federal' ?
                [242 /*Фед*/, 463 /*Одн*/] :
                [228 /*Фед*/, 423 /*Одн*/]
            ).concat(electoralDistrict.type === 'federal' ?
              [654 /*Явка 17.09*/, 655 /*Явка 18.09*/, 453 /*Явка 19.09*/] :
              [656 /*Явка 17.09*/, 657 /*Явка 18.09*/, 454 /*Явка 19.09*/]
            ).concat(electoralDistrict.type === 'federal' ?
              [471 /*Прикрепились*/, 472 /*Открепились*/] :
              []
            );
            let result = null;
            for (let reportIndex = 0; reportIndex < reports.length; reportIndex++) {
              const reportId = reports[reportIndex];
              const reportDocument = (await getHtmlFile(
                path.join('data-raw', REGION_NAME, 'restored-uik', tikId.toString(), uikId.toString(), electionKey + '_' + election.data_id + '_' + reportId + '.json'),
                'http://' + IZBIRKOM_HOST + '/region/izbirkom?action=show&type=' + reportId + '&tvd=' + electionInfo.commission_data_id + '&vrn=' + election.data_id,
                true
              )).document;
              switch (reportId) {
                case 242: case 423:
                case 228: case 463: {
                  // Result
                  const isFederal = reportId === 242 || reportId === 228;
                  const protocolRaw = parseDataTableRows4(reportDocument, reportId);
                  if (protocolRaw) {
                    const targetElectoralDistrict = isFederal ? partiesElectoralDistrict : electoralDistrict;
                    const protocol = parseResult(protocolRaw, electionInfo.commission_data_id, targetElectoralDistrict, processCandidate, allCandidates, allParties, smartCandidates, uikVenue, uikStaticMetadataMap[electoralDistrict.type + '_' + uik.id]);

                    addProtocol(uik, tik, gik, protocol, targetElectoralDistrict, election);

                  } else {
                    console.log(uik.id, 'report', reportId, 'is missing');
                  }
                  break;
                }
                case 654: case 655: case 453:
                case 656: case 657: case 454: {
                  const turnoutRaw = parseDataTableRows2(reportDocument, uik, electoralDistrict.type, electoralDistrict.id);
                  if (turnoutRaw) {
                    if (result) {
                      Object.assign(result.turnout_protocols, turnoutRaw);
                    }
                    uik.stats.turnout_protocol_count++;
                    tik.stats.turnout_protocol_count++;
                    gik.stats.turnout_protocol_count++;
                  }
                  break;
                }
                case 471:
                case 472: {
                  // Attached / Detached
                  const metadata = parseDataTableRows(reportDocument, uik, electoralDistrict.type, electoralDistrict.id, result);
                  if (!empty(metadata)) {
                    // console.log(uik.id, reportId, toJson(metadata));
                    assignMetadata(result, metadata);
                  }
                  break;
                }
                default: {
                  throw Error('Unknown reportId: ' + reportId);
                }
              }
            }
          }

          uik.stats.ballot_count = uik.election_ids.length;
        }
      }
    }

    for (const awardType in awards) {
      for (const commissionType in awards[awardType]) {
        if (!['gik', 'tik', 'uik'].includes(commissionType)) {
          continue;
        }
        const scopedAwards = awards[awardType][commissionType];
        for (const commissionId in scopedAwards) {
          let commissionAwards = scopedAwards[commissionId];
          let commission;
          switch (commissionType) {
            case 'uik':
              commission = uikMap[commissionId];
              break;
            case 'tik':
              commission = gik.tiks[commissionId];
              break;
            case 'gik':
              commission = gik;
              break;
          }
          let isParent = false;
          do {
            const key = isParent ? commissionType + '_awards' : 'awards';
            if (!commission[key])
              commission[key] = {};
            commission[key][awardType] = (commission[key][awardType] || 0) + commissionAwards.length;
            if (commission.parent_commission) {
              switch (commission.parent_commission.type) {
                case 'tik':
                  commission = gik.tiks[commission.parent_commission.id];
                  break;
                case 'gik':
                  commission = gik;
                  break;
                default:
                  throw Error();
              }
              isParent = true;
            } else {
              commission = null;
            }
          } while (commission);
        }
      }
    }

    Object.keys(gik.tiks).forEach((tikId) => {
      const tik = gik.tiks[tikId];

      for (const uikId in tik.uiks) {
        const uik = tik.uiks[uikId];

        // Find exceeding amounts
        const uikResults = resultsByUik[uik.id];
        const electoralDistrictTypes = Object.keys(uikResults);
        const uikTurnout = { };
        electoralDistrictTypes.forEach((myDistrictType) => {
          const electoralDistrictIds = Object.keys(uikResults[myDistrictType]);
          electoralDistrictIds.forEach((myDistrictId) => {
            const myResult = uikResults[myDistrictType][myDistrictId];
            if (myResult.empty) {
              tik.stats.empty_protocol_count++;
              uik.stats.empty_protocol_count++;
              gik.stats.empty_protocol_count++;
              return;
            }
            gik.stats.protocol_count++;
            tik.stats.protocol_count++;
            uik.stats.protocol_count++;

            const myTurnoutCount = myResult.official_result.turnout.count;
            const myAttachedCount = myResult.metadata.voters.attached_count || 0;
            const myRegisteredCount = myResult.metadata.voters.registered_count;
            const myAbstainedCount = myRegisteredCount - myTurnoutCount;

            let subKey = null, id = null;
            switch (myDistrictType) {
              case 'federal':
              case 'city':
                if (myDistrictId.startsWith('person_')) {
                  subKey = 'person_count';
                  id = parseInt(myDistrictId.substring('person_'.length));
                } else {
                  subKey = 'party_count';
                }
                break;
              case 'municipality':
                if (myDistrictId.startsWith('person_')) {
                  subKey = 'person_count';
                  id = myDistrictId.substring('person_'.length);
                } else {
                  throw Error(myDistrictId);
                }
                break;
              default:
                throw Error(myDistrictType);
            }

            const myTurnout = uikTurnout[myDistrictType] || (uikTurnout[myDistrictType] = {
              id: null,

              party_voters_count: -1,
              party_abstained_count: -1,
              party_registered_count: -1,
              party_attached_count: -1,

              person_voters_count: -1,
              person_abstained_count: -1,
              person_registered_count: -1,
              person_attached_count: -1,

              max_attached_count: -1
            });

            if (id && myTurnout.id)
              throw Error(myDistrictType + ' ' + id + ' already exists: ' + toJson(uikTurnout));
            if (id) {
              myTurnout.id = id;
            }
            const votersCountKey = subKey.replace(/(?=_count$)/, '_voters');
            if (myTurnout[votersCountKey] != -1)
              throw Error(myDistrictType + '.' + subKey + ' already set: ' + toJson(uikTurnout));
            myTurnout[votersCountKey] = myTurnoutCount;
            myTurnout[subKey.replace(/(?=_count$)/, '_abstained')] = myAbstainedCount;
            myTurnout[subKey.replace(/(?=_count$)/, '_registered')] = myRegisteredCount;
            if (myTurnout.max_attached_count != -1 && myTurnout.max_attached_count != myAttachedCount)
              throw Error(uik.id + ', ' + toJson(myTurnout));
            myTurnout.max_attached_count = myAttachedCount;

            if (myDistrictType === 'municipality') {
              delete myTurnout.party_voters_count;
              delete myTurnout.party_abstained_count;
              delete myTurnout.party_registered_count;
            }
          });
        });
        if (empty(uikTurnout)) {
          const analysis = uik.analysis.all || (uik.analysis.all = {});
          addOrSet(analysis, 'errors', 'empty');
        } else {
          electoralDistrictTypes.forEach((myDistrictType) => {
            if (!uikTurnout[myDistrictType]) {
              const analysis = uik.analysis[myDistrictType] || (uik.analysis[myDistrictType] = {});
              addOrSet(analysis, 'warnings', 'no_' + myDistrictType + '_result');
            }
          });
          Object.keys(uikTurnout).forEach((myDistrictType) => {
            const myTurnout = uikTurnout[myDistrictType];
            const analysis = uik.analysis[myDistrictType] || (uik.analysis[myDistrictType] = {});
            if (myTurnout.party_voters_count > 0)
              analysis.party_voters_count = myTurnout.party_voters_count;
            if (myTurnout.party_abstained_count > 0)
              analysis.party_abstained_count = myTurnout.party_abstained_count;
            if (myTurnout.party_registered_count > 0)
              analysis.party_registered_count = myTurnout.party_registered_count;

            if (myTurnout.person_voters_count > 0)
              analysis.person_voters_count = myTurnout.person_voters_count;
            if (myTurnout.person_abstained_count > 0)
              analysis.person_abstained_count = myTurnout.person_abstained_count;
            if (myTurnout.person_registered_count > 0)
              analysis.person_registered_count = myTurnout.person_registered_count;

            if (myTurnout.max_attached_count > 0)
              analysis.max_attached_count = myTurnout.max_attached_count;
            if (myTurnout.party_voters_count !== undefined) {
              if (myTurnout.party_voters_count == -1) {
                addOrSet(analysis, 'warnings', 'missing_party_result');
              } else if (myTurnout.person_voters_count == -1) {
                addOrSet(analysis, 'warnings', 'missing_person_result');
              } else {
                let difference = myTurnout.party_voters_count - myTurnout.person_voters_count;
                const onlyPartiesCount = Math.max(0, difference);
                const onlyPersonCount = Math.max(0, -difference);
                if (onlyPartiesCount) {
                  analysis.only_party_voters_count = onlyPartiesCount;
                }
                if (onlyPersonCount) {
                  analysis.only_person_voters_count = onlyPersonCount;
                }
                difference += myTurnout.party_abstained_count - myTurnout.person_abstained_count;
                const onlyPartiesRegisteredCount = Math.max(0, difference);
                const onlyPersonRegisteredCount = Math.max(0, -difference);
                if (onlyPartiesRegisteredCount) {
                  analysis.only_party_registered_count = onlyPartiesRegisteredCount;
                }
                if (onlyPersonRegisteredCount) {
                  analysis.only_person_registered_count = onlyPersonRegisteredCount;
                }
              }
            }
            if (empty(analysis)) {
              delete uik.analysis[myDistrictType];
            }
          });
          Object.keys(uik.analysis).forEach((myDistrictType) => {
            Object.keys(uik.analysis).forEach((otherDistrictType) => {
              if (myDistrictType == otherDistrictType) {
                return;
              }

              const my = uik.analysis[myDistrictType];
              const other = uik.analysis[otherDistrictType];

              const myCountMax = Math.max(my.party_voters_count || 0, my.person_voters_count || 0);
              const myCountMin = my.party_voters_count || my.person_voters_count ? Math.min(my.party_voters_count || Number.MAX_VALUE, my.person_voters_count || Number.MAX_VALUE) : 0;

              const myRegisteredCountMax = Math.max(my.party_registered_count || 0, my.person_registered_count || 0);
              const myRegisteredCountMin = my.party_registered_count || my.person_registered_count ? Math.min(my.party_registered_count || Number.MAX_VALUE, my.person_registered_count || Number.MAX_VALUE) : 0;

              const otherCountMax = Math.max(other.party_voters_count || 0, other.person_voters_count || 0);
              const otherCountMin = other.party_voters_count || other.person_voters_count ? Math.min(other.party_voters_count || Number.MAX_VALUE, other.person_voters_count || Number.MAX_VALUE) : 0;

              const otherRegisteredCountMax = Math.max(other.party_registered_count || 0, other.person_registered_count || 0);
              const otherRegisteredCountMin = other.party_registered_count || other.person_registered_count ? Math.min(other.party_registered_count || Number.MAX_VALUE, other.person_registered_count || Number.MAX_VALUE) : 0;

              const noOtherCount = Math.max(0, myCountMin - otherCountMin);
              const noOtherCountMax = Math.max(0, myCountMax - otherCountMin);
              const noOtherRegisteredCount = Math.max(0, myRegisteredCountMin - otherRegisteredCountMin);

              const onlyMyCount = Math.max(0, otherCountMin - myCountMax);
              const onlyMyCountMax = Math.max(0, otherCountMax - myCountMin);
              const onlyMyRegisteredCount = Math.max(0, otherRegisteredCountMin - myRegisteredCountMax);
              const onlyMyRegisteredCountMax = Math.max(0, otherRegisteredCountMax - myRegisteredCountMin);

              if (noOtherCount) {
                my['no_' + otherDistrictType + '_count'] = noOtherCount;
                const nowCount = my['no_other_count'] || 0;
                if (noOtherCount > nowCount) {
                  my['no_other_count'] = noOtherCount;
                  my['no_other_count_formula'] = [
                    {key: (myDistrictType + '.voters_count.' + ((my.party_voters_count || Number.MAX_VALUE) < (my.person_voters_count || Number.MAX_VALUE) ? 'party' : 'person')), value: myCountMin, isNegative: false},
                    '-',
                    {key: (otherDistrictType + '.voters_count.' + ((other.party_voters_count || Number.MAX_VALUE) < (other.person_voters_count || Number.MAX_VALUE) ? 'party' : 'person')), value: otherCountMin, isNegative: true}
                  ];
                }
              }
              if (noOtherCountMax > noOtherCount) {
                my['no_' + otherDistrictType + '_count_max'] = noOtherCountMax;
              }
              if (noOtherRegisteredCount) {
                my['no_' + otherDistrictType + '_registered_count'] = noOtherRegisteredCount;
                const nowCount = my['no_other_registered_count'] || 0;
                if (noOtherRegisteredCount > nowCount) {
                  my['no_other_registered_count'] = noOtherRegisteredCount;
                  my['no_other_registered_count_formula'] = [
                    {key: (myDistrictType + '.registered_count.' + ((my.party_registered_count || Number.MAX_VALUE) < (my.person_registered_count || Number.MAX_VALUE) ? 'party' : 'person')), value: myRegisteredCountMin, isNegative: false},
                    '-',
                    {key: (otherDistrictType + '.registered_count.' + ((other.party_registered_count || Number.MAX_VALUE) < (other.person_registered_count || Number.MAX_VALUE) ? 'party' : 'person')), value: otherRegisteredCountMin, isNegative: true}
                  ];
                }
              }

              if (onlyMyCount) {
                my['only_' + otherDistrictType + '_count'] = onlyMyCount;
              }
              if (onlyMyCountMax > onlyMyCount) {
                my['only_' + otherDistrictType + '_count_max'] = onlyMyCountMax;
              }
              if (onlyMyRegisteredCount) {
                my['only_' + otherDistrictType + '_registered_count'] = onlyMyRegisteredCount;
              }
              if (onlyMyRegisteredCountMax > onlyMyRegisteredCount) {
                my['only_' + otherDistrictType + '_registered_count_max'] = onlyMyRegisteredCountMax;
              }
            });
          });

          Object.keys(uik.analysis).forEach((myDistrictType) => {
            Object.keys(uik.analysis).forEach((otherDistrictType) => {
              ['party_voters_count', 'person_voters_count'].forEach((myKey) => {
                ['party_voters_count', 'person_voters_count'].forEach((otherKey) => {
                  if (myDistrictType == otherDistrictType && myKey == otherKey)
                    return;

                  const errorKey = 'exceeded_' + myKey;

                  const myAnalysis = uik.analysis[myDistrictType] || (uik.analysis[myDistrictType] = {});
                  const myCount = myAnalysis[myKey];
                  const myExceededCount = myAnalysis[errorKey] ? myAnalysis[errorKey].value : 0;

                  const otherAnalysis = uik.analysis[otherDistrictType] || (uik.analysis[otherDistrictType] = {});
                  const otherCount = otherAnalysis[otherKey];

                  if (typeof myCount !== 'number' || typeof otherCount !== 'number' || myCount <= 0 || otherCount <= 0)
                    return;

                  const myAttachedCount = myAnalysis.max_attached_count || 0;
                  const _myNoOtherRegisteredCount = myAnalysis['no_other_registered_count'] || Number.MAX_SAFE_INTEGER;
                  const _myNoOtherVotersCount = myAnalysis['no_other_count'] || Number.MAX_SAFE_INTEGER;
                  let myNoOtherRegisteredCount = myDistrictType === otherDistrictType ? Math.min(_myNoOtherRegisteredCount, _myNoOtherVotersCount) : 0;
                  if (myNoOtherRegisteredCount == Number.MAX_SAFE_INTEGER) {
                    myNoOtherRegisteredCount = 0;
                  }

                  const exceededCount = 0 ; // myCount - (uik.abroad || uik.unknown ? myCount : otherCount + myAttachedCount - myNoOtherRegisteredCount);

                  if (exceededCount > 0 && exceededCount >= myExceededCount) {
                    const normalizeKey = (key) => {
                      return key.startsWith('person_') ? key.substring('person_'.length) + '.person' : key.startsWith('party_') ? key.substring('party_'.length) + '.party' : key;
                    };
                    let formula = [];
                    [
                      [myCount, myDistrictType + '.' + normalizeKey(myKey)],
                      [-otherCount, otherDistrictType + '.' + normalizeKey(otherKey)],
                      [-myAttachedCount, myDistrictType + '.attached_count']
                    ].forEach((num) => {
                      if (num[0]) {
                        if (formula.length || num[0] < 0) {
                          formula.push(num[0] > 0 ? '+' : '-');
                        }
                        formula.push({key: num[1], value: Math.abs(num[0]), isNegative: num[0] < 0});
                      }
                    });
                    if (myNoOtherRegisteredCount) {
                      formula.push('+');
                      formula = formula.concat(myAnalysis[_myNoOtherVotersCount < _myNoOtherRegisteredCount ? 'no_other_count_formula' : 'no_other_registered_count_formula']);
                    }
                    if (exceededCount > myExceededCount || formula.length < myAnalysis[errorKey].formula.length) {
                      const isSignificant = exceededCount > 1;
                      const wasSignificant = myExceededCount > 1;
                      const targetSet = isSignificant ? 'errors' : 'warnings';
                      if (wasSignificant != isSignificant) {
                        removeFromSet(myAnalysis, 'warnings', errorKey);
                      }
                      addOrSet(myAnalysis, targetSet, errorKey);

                      myAnalysis[errorKey] = {
                        value: exceededCount,
                        formula: formula
                      };
                    }
                  }
                });
              });

            });
          });

          if (uikTurnout.federal && uikTurnout.city) {
            if (uikTurnout.federal.party_voters_count != -1 && uikTurnout.federal.person_voters_count != -1 && uikTurnout.city.party_voters_count != -1 && uikTurnout.city.person_voters_count &&
              uikTurnout.federal.party_voters_count - Math.min(uikTurnout.federal.person_voters_count, uikTurnout.city.party_voters_count, uikTurnout.city.person_voters_count) <= uikTurnout.federal.attached_count &&
              uikTurnout.federal.party_voters_count >= uikTurnout.federal.person_voters_count && uikTurnout.federal.person_voters_count == uikTurnout.city.person_voters_count && uikTurnout.city.party_voters_count == uikTurnout.city.person_voters_count &&
              (!uikTurnout.municipality || uikTurnout.municipality.person_voters_count == uikTurnout.city.person_voters_count)) {
              addOrSet(uik.analysis.all || (uik.analysis.all = {}), 'info', 'papers_count_match_perfectly');
            }
          }
        }

        uik.stats.ballot_count = uik.election_ids.length;

        if (uik.stats.protocol_count == 0) {
          uik.empty = true;
        }

        [gik, tik].forEach((parent) => {
          // bump uik and koib count
          if (uik.empty) {
            parent.stats.empty_uik_count++;
            if (uik.has_koib) {
              parent.stats.empty_koib_count++;
            }
          } else {
            parent.stats.uik_count++;
            if (uik.has_koib) {
              parent.stats.koib_count++;
            }
          }

          // merge analysis
          const parentAnalysis = parent.uik_analysis || (parent.uik_analysis = {});

          const mergedValue = (value) => {
            if (typeof value === 'string') {
              const exceededKey = value.match(/^(exceeded_)(?:party|person)_(voters_count)$/);
              if (exceededKey) {
                return exceededKey[1] + exceededKey[2];
              }
              const missingKey = value.match(/^(missing_)(?:party|person)(_result)$/);
              if (missingKey) {
                return missingKey[1] + 'one' + missingKey[2];
              }
            }
            return value;
          };
          const mergedKey = (key) => {
            return key === 'errors' || key === 'warnings' || key === 'info' ? 'messages' : null;
          };

          for (const electionDistrictType in uik.analysis) {
            if (!uik.analysis.hasOwnProperty(electionDistrictType))
              continue;
            const uikAnalysis = uik.analysis[electionDistrictType];

            if (electionDistrictType !== 'all') {
              const exceededPartyVotersCount = uikAnalysis.exceeded_party_voters_count ? uikAnalysis.exceeded_party_voters_count.value : 0;
              const exceededPersonVotersCount = uikAnalysis.exceeded_person_voters_count ? uikAnalysis.exceeded_person_voters_count.value : 0;
              const protocols = uikResults[electionDistrictType];
              if (!protocols)
                throw Error();
              const protocol = protocols.parties;
              if (protocol) {
                const analysis = Object.assign(protocol.metadata.analysis, {
                  protocol_count: protocol.empty ? 0 : 1,
                  exceeded_papers_count: exceededPartyVotersCount || 0,
                  exceeded_papers_steal_winning: 0,
                  exceeded_papers_provide_extra_places: 0,
                  multiple_winners: 0
                });
                if (!protocol.empty) {
                  const winnerEntry = findPlace(protocol, 1);
                  if (winnerEntry.official_result.votes_count > 0) {
                    if (exceededPartyVotersCount > 0 && (winnerEntry.official_result.place % 1.0 !== 0 || winnerEntry.official_result.votes_count - exceededPartyVotersCount <= findPlace(protocol, 2).official_result.votes_count)) {
                      analysis.exceeded_papers_steal_winning = 1;
                    }
                    if (winnerEntry.official_result.place % 1.0 !== 0) {
                      analysis.multiple_winners = 1;
                    }
                    const votesPerPlace = protocol.metadata.papers.valid_count / (electionDistrictType === 'city' ? 25 : 225);
                    const placesCount = winnerEntry.official_result.votes_count / votesPerPlace;
                    const placesWithoutExceedingCount = (winnerEntry.official_result.votes_count - exceededPartyVotersCount) / votesPerPlace;
                    if (placesCount > placesWithoutExceedingCount) {
                      analysis.exceeded_papers_provide_extra_places = 1;
                    }
                  }
                  validateChecksum(protocol);
                }

                if (analysis.exceeded_papers_steal_winning || analysis.exceeded_papers_provide_extra_places) {
                  const output = parentAnalysis.stealing || (parentAnalysis.stealing = {win: {uik_count: 0, protocol_count: 0}, extra_space: {uik_count: 0, protocol_count: 0}});
                  if (analysis.exceeded_papers_steal_winning) {
                    output.win.protocol_count++;
                    if (addOrSet(output.win, 'uik', protocol.related_to.uik)) {
                      output.win.uik_count++;
                    }
                  }
                  if (analysis.exceeded_papers_provide_extra_places) {
                    output.extra_space.protocol_count++;
                    if (addOrSet(output.extra_space, 'uik', protocol.related_to.uik)) {
                      output.extra_space.uik_count++;
                    }
                  }
                }
              }
              const personKeys = Object.keys(protocols).filter((key) => key !== 'parties');
              if (personKeys.length) {
                if (personKeys.length > 1)
                  throw Error();
                const personProtocols = personKeys.map((personKey) => protocols[personKey]);
                personProtocols.forEach((protocol) => {
                  const analysis = Object.assign(protocol.metadata.analysis, {
                    protocol_count: protocol.empty ? 0 : 1,
                    exceeded_papers_count: exceededPersonVotersCount || 0,
                    exceeded_papers_steal_winning: 0
                  });
                  if (!protocol.empty) {
                    const winnerEntry = findPlace(protocol, 1);
                    if (winnerEntry.official_result.votes_count > 0) {
                      if (exceededPersonVotersCount > 0 && (winnerEntry.official_result.place % 1.0 !== 0 || winnerEntry.official_result.votes_count - exceededPersonVotersCount <= findPlace(protocol, 2).official_result.votes_count)) {
                        analysis.exceeded_papers_steal_winning = 1;
                      }
                    }
                    validateChecksum(protocol);
                  }

                  if (analysis.exceeded_papers_steal_winning || analysis.exceeded_papers_provide_extra_places) {
                    const output = parentAnalysis.stealing || (parentAnalysis.stealing = {win: {uik_count: 0, protocol_count: 0}, extra_space: {uik_count: 0, protocol_count: 0}});
                    if (analysis.exceeded_papers_steal_winning) {
                      output.win.protocol_count++;
                      if (addOrSet(output.win, 'uik', protocol.related_to.uik)) {
                        output.win.uik_count++;
                      }
                    }
                    if (analysis.exceeded_papers_provide_extra_places) {
                      output.extra_space.protocol_count++;
                      if (addOrSet(output.extra_space, 'uik', protocol.related_to.uik)) {
                        output.extra_space.uik_count++;
                      }
                    }
                  }
                });
              }
            }

            for (const key in uikAnalysis) {
              if (!uikAnalysis.hasOwnProperty(key))
                continue;
              const value = uikAnalysis[key];
              const commonKey = mergedKey(key, electionDistrictType);
              const commonAnalysis = parentAnalysis['common'] || (parentAnalysis['common'] = {});
              const electionDistrictKey = electionDistrictType + '_' + uik.electoral_districts[electionDistrictType];
              const groupedAnalysis = parentAnalysis[electionDistrictKey] || (parentAnalysis[electionDistrictKey] = {});

              if (key === 'errors' || key === 'warnings' || key === 'info') {
                const output = groupedAnalysis[commonKey] || (groupedAnalysis[commonKey] = {});
                const mergedOutput = (commonAnalysis[commonKey] || (commonAnalysis[commonKey] = {}));

                const addItem = (item) => {
                  const commonItem = mergedValue(item);
                  let mergedObj = null;
                  if (mergedOutput) {
                    mergedObj = mergedOutput[commonItem] || (mergedOutput[commonItem] = {
                      uik_count: 0,
                      uiks: null
                    });
                    if (addOrSet(mergedObj, 'uiks', uik.id)) {
                      mergedObj.uik_count++;
                    }
                  }
                  const obj = output[item] || (output[item] = {
                    uik_count: 0,
                    uiks: null
                  });
                  if (addOrSet(obj, 'uiks', uik.id)) {
                    obj.uik_count++;
                    if (mergedObj && electionDistrictType !== 'all') {
                      mergedObj[electionDistrictType + '_uik_count'] = (mergedObj[electionDistrictType + '_uik_count'] || 0) + 1;
                    }
                  }
                  const intValue = uikAnalysis[item];
                  if (intValue && intValue.value) {
                    obj.value = (obj.value || 0) + intValue.value;
                    if (mergedObj) {
                      mergedObj.value = (mergedObj.value || 0) + intValue.value;
                    }
                  }
                };
                if (Array.isArray(value)) {
                  value.forEach(addItem);
                } else {
                  addItem(value);
                }
              } else {
                switch (typeof value) {
                  case 'object': {
                    if (!value.value) {
                      if (key.endsWith('_formula'))
                        break; // just ignore formulas
                      throw Error(key + ' ' + toJson(value));
                    }
                    groupedAnalysis[key] = (groupedAnalysis[key] || 0) + value.value;
                    if (commonKey) {
                      commonAnalysis[commonKey] = (commonAnalysis[commonKey] || 0) + value.value;
                    }
                    break;
                  }
                  case 'number': {
                    groupedAnalysis[key] = (groupedAnalysis[key] || 0) + value;
                    if (commonKey) {
                      commonAnalysis[commonKey] = (commonAnalysis[commonKey] || 0) + value;
                    }
                    break;
                  }
                  default: {
                    throw Error(key + ' ' + value + ' ' + (typeof value) + ' ' + toJson(uikAnalysis));
                  }
                }
              }
            }
          }
        });
      }


      Object.keys(tik.uiks_by_electoral_district).forEach((electoralDistrictType) => {
        Object.keys(tik.uiks_by_electoral_district[electoralDistrictType]).forEach((districtId) => {
          const uiks = tik.uiks_by_electoral_district[electoralDistrictType];
          if ((Array.isArray(uiks[districtId]) ? uiks[districtId].length : 1) == (tik.stats.uik_count + tik.stats.empty_uik_count)) {
            uiks[districtId] = 'all';
          } else {
            addOrSet(tik.uiks_by_electoral_district, 'unusual_cases', electoralDistrictType);
          }
        });
      });
    });

    // console.log(toJson(awards));

    Object.assign(data, {
      gik: gik,
      uiks: uikMap,
      members: allMembers.entries,
      addresses: allAddresses.entries,
      districts: districtMap,
      assignedBy: allAssignedBys.entries,
      roles: allRoles.entries,
      elections: allElections.entries,
      electoral_districts: allElectoralDistricts.entries,
      candidates: allCandidates.entries,
      parties: allParties.entries,
      results_by_uik: resultsByUik,
      violations_map: violationsMap,
      results_by_tik: { },
      results_by_district: { },
      results_by_gik: { },
      version: {
        id: VERSION,
        date: {
          started: startedDate,
          finished: null
        }
      }
    });

    // Krylov method. Find stuffing based on location + turnout
    // Step 1. Find stuffing based on location of the uik
    for (const addressId in allAddresses.entries) {
      if (!allAddresses.entries.hasOwnProperty(addressId))
        continue;
      const address = allAddresses.entries[addressId];
      if (!Array.isArray(address.related_to.uik))
        continue;

      const uikProtocols = {};
      for (let uikIndex = 0; uikIndex < address.related_to.uik.length; uikIndex++) {
        const uikId = address.related_to.uik[uikIndex];

        const allUikProtocols = data.results_by_uik[uikId];
        for (const electoralDistrictType in allUikProtocols) {
          if (!allUikProtocols.hasOwnProperty(electoralDistrictType) || getWinnerCount(electoralDistrictType) !== 1) {
            continue;
          }
          const districtProtocols = allUikProtocols[electoralDistrictType];
          for (const electoralDistrictId in districtProtocols) {
            if (!districtProtocols.hasOwnProperty(electoralDistrictId)) {
              continue;
            }
            const uikProtocol = districtProtocols[electoralDistrictId];
            if (!uikProtocol.empty) {
              let target = uikProtocols[electoralDistrictType] || (uikProtocols[electoralDistrictType] = {});
              target = target[electoralDistrictId] || (target[electoralDistrictId] = []);
              target.push(uikProtocol);
            }
          }
        }
      }

      for (const electoralDistrictType in uikProtocols) {
        const districtProtocols = uikProtocols[electoralDistrictType];
        for (const electoralDistrictId in districtProtocols) {
          const protocols = districtProtocols[electoralDistrictId];
          if (protocols.length < 2)
            continue;

          // Step 1. asc sorting based on the turnout percentage of the winner
          protocols.sort((a, b) => {
            let aPercentage, bPercentage;

            aPercentage = a.official_result.turnout.valid_percentage;
            bPercentage = b.official_result.turnout.valid_percentage;
            if (aPercentage !== bPercentage) {
              return aPercentage < bPercentage ? -1 : 1;
            }

            aPercentage = a.official_result.winner.registered_percentage;
            bPercentage = b.official_result.winner.regsitered_percentage;
            if (aPercentage !== bPercentage) {
              return aPercentage < bPercentage ? -1 : 1;
            }

            return 0;
          });
          // Step 1. Find the one with the lowest turnout
          const resultsPerfectlyMatchWithoutCandidate = (baseProtocol, abnormalProtocol, excludeCandidateId, abnormalPercentageDifference) => {
            const baseEntries = baseProtocol.entries;
            const abnormalEntries = abnormalProtocol.entries;
            for (let entryIndex = 0; entryIndex < baseEntries.length; entryIndex++) {
              const baseEntry = baseEntries[entryIndex];
              const baseCandidateId = baseEntry.candidate_id || baseEntry.party_id;
              if (baseCandidateId === excludeCandidateId) {
                continue;
              }
              const otherEntry = findCandidate(abnormalEntries, baseCandidateId, baseEntry.official_result.position);
              if (Math.abs(otherEntry.official_result.registered_percentage - baseEntry.official_result.registered_percentage) >= 3.0 && Math.abs(otherEntry.official_result.votes_count - baseEntry.official_result.votes_count) >= 30) {
                return false;
              }
            }
            return true;
          };
          const baseProtocol = protocols.splice(0, 1)[0];
          const abnormalPercentageDifference = 5.0;
          for (let otherProtocolIndex = 0; otherProtocolIndex < protocols.length; otherProtocolIndex++) {
            const targetProtocol = protocols[otherProtocolIndex];
            for (let entryIndex = 0; entryIndex < targetProtocol.entries.length; entryIndex++) {
              const entry = targetProtocol.entries[entryIndex];
              const entryId = entry.candidate_id || entry.party_id;
              const baseEntry = findCandidate(baseProtocol.entries, entryId, entry.position);
              const extraPercentage = entry.official_result.valid_percentage - baseEntry.official_result.valid_percentage;
              if (extraPercentage >= abnormalPercentageDifference) {
                // OK. So one candidate has better result on one UIK than the other. Let's see what happens if we exclude them
                if (resultsPerfectlyMatchWithoutCandidate(baseProtocol, targetProtocol, entry.party_id || entry.candidate_id, abnormalPercentageDifference)) {
                  const ratio = baseEntry.official_result.votes_count / (baseProtocol.metadata.papers.valid_count - baseEntry.official_result.votes_count);
                  const approximateRealVotesCount = (targetProtocol.metadata.papers.valid_count - entry.official_result.votes_count) * ratio;
                  targetProtocol.metadata.analysis['stuffed_protocol_for_' + entryId] = 1;
                  targetProtocol.metadata.analysis['stuffed_votes_for_' + entryId] = entry.official_result.votes_count - approximateRealVotesCount;
                  break;
                } else {
                  // TODO mark as hand-written protocol?
                }
              }
            }
          }
        }
      }
    }

    // Results post-processing
    Object.keys(data.results_by_uik).forEach((uikId) => {
      const uik = data.uiks[uikId];
      const uikResults = data.results_by_uik[uikId];
      Object.keys(uikResults).forEach((electoralDistrictType) => {
        Object.keys(uikResults[electoralDistrictType]).forEach((electoralDistrictId) => {
          const uikResult = uikResults[electoralDistrictType][electoralDistrictId];
          if (!uikResult.related_to.tik) {
            console.error('UIK', uikId, 'is not related to any TIK?\n' + toJson(uikResult));
            throw Error();
          }
          const uikVenue = {
            type: 'УИК',
            id: uikResult.related_to.uik,
            district: uikResult.related_to.district,
            parent: {
              type: 'ТИК',
              id: uikResult.related_to.tik,
              parent: {
                type: 'ГИК',
                id: uikResult.related_to.gik
              }
            }
          };

          // by TIK
          let tikResult = data.results_by_tik[electoralDistrictType] || (data.results_by_tik[electoralDistrictType] = {});
          tikResult = tikResult[electoralDistrictId] || (tikResult[electoralDistrictId] = {});
          tikResult = tikResult[uikResult.related_to.tik] || (tikResult[uikResult.related_to.tik] = {});
          if (empty(tikResult)) {
            Object.assign(tikResult, {
              commission_name: 'ТИК №' + uikResult.related_to.tik, // TODO tik
              ballot_name: uikResult.ballot_name,
              name: uikResult.name,
              protocol_scope: {
                type: 'tik',
                id: uikResult.related_to.tik
              },
              electoral_district: uikResult.electoral_district
            });
          }

          // by DISTRICT
          const tik = gik.tiks[uikResult.related_to.tik];
          const uikAddressId = uik.address_id || uik.voting_address_id;
          const uikAddress = allAddresses.entries[uikAddressId];

          const district = uikAddress ? (uikAddress.abroad ? abroadKey(uikAddress) : uikAddress.address.district) : tik.district;
          if (!district) {
            throw Error(toJson(allAddresses.entries[tikAddressId]));
          }

          if (addOrSet(tik, 'districts', district)) {
            tik.stats.district_count = (tik.stats.district_count || 0) + 1;
          }
          if (addOrSet(gik, 'districts', district)) {
            gik.stats.district_count = (gik.stats.district_count || 0) + 1;
          }

          let districtResult = data.results_by_district[electoralDistrictType] || (data.results_by_district[electoralDistrictType] = {});
          districtResult = districtResult[electoralDistrictId] || (districtResult[electoralDistrictId] = {});
          districtResult = districtResult[district] || (districtResult[district] = {});
          if (empty(districtResult)) {
            Object.assign(districtResult, {
              district_name: district,
              ballot_name: uikResult.ballot_name,
              name: uikResult.name,
              protocol_scope: {
                type: 'district',
                id: district
              },
              electoral_district: uikResult.electoral_district
            });
          }

          // by GIK
          let gikResult = data.results_by_gik[electoralDistrictType] || (data.results_by_gik[electoralDistrictType] = {});
          gikResult = gikResult[electoralDistrictId] || (gikResult[electoralDistrictId] = {});
          gikResult = gikResult[uikResult.related_to.gik] || (gikResult[uikResult.related_to.gik] = {});
          if (empty(gikResult)) {
            Object.assign(gikResult, {
              commission_name: uikResult.related_to.gik,
              ballot_name: tikResult.ballot_name,
              name: tikResult.name,
              protocol_scope: {
                type: 'gik',
                id: uikResult.related_to.gik
              },
              electoral_district: uikResult.electoral_district
            });
          }

          // TIK & DISTRICT & GIK

          [tikResult, districtResult, gikResult].forEach((groupedResult, groupedDataIndex) => {
            const groupingLevel = groupedDataIndex == 2 ? 'gik' : groupedDataIndex == 1 ? 'district' : 'tik';
            const parentWinnerKey = groupingLevel + '_winner';

            if (groupedResult.entries === undefined) {
              Object.assign(groupedResult, {
                stats: {
                  district_count: groupedDataIndex == 2 ? null : undefined,
                  tik_count: groupingLevel != 'tik' ? 0 : undefined,
                  uik_count: 0,
                  koib_count: 0,
                  empty_uik_count: 0,
                  empty_koib_count: 0,
                  protocol_count: 0,
                  empty_protocol_count: 0
                },
                official_result: {
                  winner: {
                    id: null, // candidate_id or party_id
                    position: null,
                    percentage: null,
                    valid_percentage: null,
                    registered_percentage: null
                  },
                  turnout: {
                    count: 0,
                    percentage: null,
                    walk_by_count: 0,
                    walk_by_percentage: null,
                    on_home_count: 0,
                    on_home_percentage: null,
                    ahead_of_time_count: 0,
                    ahead_of_time_percentage: null,
                    valid_count: 0,
                    valid_percentage: null,
                    invalid_count: 0,
                    invalid_percentage: null,
                    lost_count: 0,
                    lost_percentage: null,
                    taken_home_count: 0,
                    taken_home_percentage: null
                  },
                  turnout_stats: {
                    count: null,
                    walk_by_count: null,
                    on_home_count: null,
                    ahead_of_time_count: null,
                    valid_count: null,
                    invalid_count: null,
                    lost_count: null,
                    taken_home_count: null
                  }
                },
                turnout_protocols_stats: { },
                metadata: { analysis: { } },
                entries: [ ]
              });
            }

            if (uikResult.empty) {
              groupedResult.stats.empty_protocol_count++;
            } else {
              groupedResult.stats.protocol_count++;
            }

            if (uik.empty) {
              if (uikResult.has_koib) {
                groupedResult.stats.empty_koib_count++;
              }
              groupedResult.stats.empty_uik_count++;
            } else {
              if (uikResult.has_koib) {
                groupedResult.stats.koib_count++;
              }
              groupedResult.stats.uik_count++;
            }

            if (uikResult.official_result.turnout) {
              ['count', 'valid_count', 'invalid_count', 'lost_count', 'walk_by_count', 'on_home_count', 'ahead_of_time_count', 'taken_home_count'].forEach((key) => {
                const count = uikResult.official_result.turnout[key];
                if (count) {
                  groupedResult.official_result.turnout[key] += count;
                }
                const stats = groupedResult.official_result.turnout_stats[key] || (groupedResult.official_result.turnout_stats[key] = newMathTarget());
                addMathItem(stats, count, uikResult.related_to.uik);
              });
            }

            if (uikResult.turnout_protocols) {
              for (const dayKey in uikResult.turnout_protocols) {
                const day = uikResult.turnout_protocols[dayKey];
                if (!day)
                  continue;
                for (const time in day) {
                  const turnout = day[time];
                  const dataKeys = Object.keys(turnout).filter((key) => key.endsWith('_delta'));
                  for (let dataKeyIndex = 0; dataKeyIndex < dataKeys.length; dataKeyIndex++) {
                    const dataKey = dataKeys[dataKeyIndex];
                    const value = turnout[dataKey];
                    let target = groupedResult.turnout_protocols_stats[dayKey] || (groupedResult.turnout_protocols_stats[dayKey] = {});
                    target = target[time] || (target[time] = {});
                    target = target[dataKey] || (target[dataKey] = newMathTarget());
                    addMathItem(target, value, uikResult.related_to.uik);
                  }
                }
              }
            }

            if (uikResult.metadata) {
              Object.keys(uikResult.metadata).forEach((metadataKey) => {
                Object.keys(uikResult.metadata[metadataKey]).forEach((metadataProperty) => {
                  if (!groupedResult.metadata[metadataKey])
                    groupedResult.metadata[metadataKey] = {};
                  groupedResult.metadata[metadataKey][metadataProperty] = (metadataKey == 'voters' && (metadataProperty == 'attached_percentage')) ? null :
                    uikResult.metadata[metadataKey][metadataProperty] +
                    (groupedResult.metadata[metadataKey][metadataProperty] || 0);
                });
              });
            }

            if (uikResult.entries) {
              uikResult.entries.forEach((uikCandidate) => {
                if (!uikCandidate || !uikCandidate.official_result) {
                  throw Error(toJson(uikCandidate) + '\n\n' + toJson(uikResult));
                }
                const candidateId = uikCandidate.party_id || uikCandidate.candidate_id;
                if (!groupedResult.official_result.votes_stats) {
                  groupedResult.official_result.votes_stats = {};
                }
                if (!groupedResult.entries) {
                  groupedResult.entries = { };
                }
                let cloned = groupedResult.entries[candidateId];
                if (!cloned) {
                  cloned = cloneWithoutResult(uikCandidate);
                  cloned.official_stats = {
                    valid_percentage: null,
                    registered_percentage: null,
                    percentage: null,
                    votes_count: null,
                  };
                  if (groupingLevel === 'gik') {
                    cloned.official_district_stats = null;
                  }
                  if (groupingLevel !== 'tik') {
                    cloned.official_tik_stats = null;
                  }
                  ['official_koib_stats', 'official_uik_stats'].forEach((key) => {
                    cloned[key] = {
                      count: {
                        total: 0,
                        won: 0,
                        lost: 0,
                        win_rate: null
                      },
                      places: { },
                      repeated_percentages: {
                        all: { },
                        valid: { },
                        registered: { }
                      },
                      weights: { }
                    };
                  });
                  groupedResult.entries[candidateId] = cloned;
                } else {
                  cloned.official_result.votes_count += uikCandidate.official_result.votes_count;
                }
                if (groupedResult.entries[candidateId].position != uikCandidate.position)
                  throw Error('Inconsistent positions between UIKs: ' + toJson(groupedResult) + '\n\n' + toJson(uikCandidate));

                // official_stats
                Object.keys(cloned.official_stats).forEach((statsKey) => {
                  const stats = cloned.official_stats[statsKey] || (cloned.official_stats[statsKey] = newMathTarget());
                  const officialResult = uikCandidate.official_result[statsKey];
                  addMathItem(stats, officialResult, uikResult.related_to.uik);
                });

                const venueName = asVenueName(uikResult.related_to.venue);

                // official_uik_stats
                const uikStats = cloned.official_uik_stats;
                uikStats.count.total++;
                if (uikCandidate.official_result.winner) {
                  uikStats.count.won++;
                } else {
                  uikStats.count.lost++;
                }
                uikStats.count.win_rate = uikStats.count.won / uikStats.count.total * 100;

                // official_uik_stats.weights
                uikStats.weights[venueName] = uikCandidate.official_result.votes_count;

                // official_uik_stats.places
                const uikPlace = uikStats.places['#' + uikCandidate.official_result.place] || (uikStats.places['#' + uikCandidate.official_result.place] = {
                  count: 0,
                  ratio_from_all_ballot_uiks: null,
                  votes_count: 0,
                  votes_weight: null,
                  valid_result_by_uik: {}
                });
                uikPlace.count++;
                uikPlace.valid_result_by_uik[venueName] = uikCandidate.official_result.valid_percentage;
                uikPlace.votes_count += uikCandidate.official_result.votes_count;

                // official_uik_stats.repeated_percentages
                ['all', 'valid', 'registered'].forEach((key) => {
                  const percentage = uikCandidate.official_result[key === 'all' ? 'percentage' : key + '_percentage'].toFixed(1);
                  const repeatedPercentage = uikStats.repeated_percentages[key][percentage] || (uikStats.repeated_percentages[key][percentage] = {
                    count: 0,
                    ratio_from_all_ballot_uiks: null,
                    votes_count: 0,
                    votes_weight: null
                  });
                  repeatedPercentage.count++;
                  repeatedPercentage.votes_count += uikCandidate.official_result.votes_count;
                });

                // official_koib_stats
                if (uikResult.has_koib) {
                  const koibStats = cloned.official_koib_stats;
                  koibStats.count.total++;
                  if (uikCandidate.official_result.winner) {
                    koibStats.count.won++;
                  } else {
                    koibStats.count.lost++;
                  }
                  koibStats.count.win_rate = koibStats.count.won / koibStats.count.total * 100;
                  // official_koib_stats.places
                  const koibPlace = koibStats.places['#' + uikCandidate.official_result.place] || (koibStats.places['#' + uikCandidate.official_result.place] = {
                    count: 0,
                    ratio_from_all_ballot_uiks: null,
                    ratio_from_koib_ballot_uiks: null,
                    votes_count: 0,
                    votes_weight: null,
                    valid_result_by_uik: {}
                  });
                  koibPlace.count++;
                  koibPlace.valid_result_by_uik[venueName] = uikCandidate.official_result.valid_percentage;
                  koibPlace.votes_count += uikCandidate.official_result.votes_count;
                  // official_koib_stats.weights
                  koibStats.weights[venueName] = uikCandidate.official_result.votes_count;
                }
              });
            }

            const uikShortResult = { };
            uikShortResult[parentWinnerKey] = {
              percentage: null,
              valid_percentage: null,
              registered_percentage: null,
              place: null
            };
            uikShortResult.uik_winner = {
              id: null,
              position: null,
              percentage: null,
              valid_percentage: null,
              registered_percentage: null
            };

            const uikShortInfo = {
              generated_date: uikResult.generated_date,
              official_result: uikShortResult
            };
            if (uikResult.empty) {
              if (!groupedResult.empty_uiks) {
                groupedResult.empty_uiks = { };
              }
              groupedResult.empty_uiks[asVenueName(uikResult.related_to.venue)] = {generated_date: uikShortInfo.generated_date};
              return;
            }

            if (!groupedResult.effective_uiks) {
              groupedResult.effective_uiks = {};
            }
            groupedResult.effective_uiks[uikResult.related_to.uik] = uikShortInfo;
            uikResult.entries.forEach((uikCandidate) => {
              const officialResult = uikCandidate.official_result;
              if (officialResult.winner) {
                addOrSet(uikShortInfo.official_result.uik_winner, 'id', uikCandidate.party_id || uikCandidate.candidate_id, true);
                addOrSet(uikShortInfo.official_result.uik_winner, 'position', uikCandidate.position, true);
                addOrSet(uikShortInfo.official_result.uik_winner, 'percentage', officialResult.percentage, true);
                addOrSet(uikShortInfo.official_result.uik_winner, 'valid_percentage', officialResult.valid_percentage, true);
                addOrSet(uikShortInfo.official_result.uik_winner, 'registered_percentage', officialResult.registered_percentage, true);
              }
            });
            if (!uikShortInfo.official_result.uik_winner.id) {
              throw Error(toJson(uikResult));
            }
          });

          if (!uikVenue.district)
            throw Error();

          addVenue(tikResult, uikVenue);
          addVenue(districtResult, uikVenue);
          addVenue(gikResult, uikVenue);
        });
      });
    });

    // Grouping all uik results by tik
    [data.results_by_tik, data.results_by_district, data.results_by_gik].forEach((groupedData, groupedDataIndex) => {
      Object.keys(groupedData).forEach((electoralDistrictType) => {
        Object.keys(groupedData[electoralDistrictType]).forEach((electoralDistrictId) => {
          Object.keys(groupedData[electoralDistrictType][electoralDistrictId]).forEach((commissionId) => {
            const groupingLevel = groupedDataIndex == 2 ? 'gik' : groupedDataIndex == 1 ? 'district' : 'tik';
            const parentWinnerKey = groupingLevel + '_winner';

            const groupedResult = groupedData[electoralDistrictType][electoralDistrictId][commissionId];
            if (groupedResult.official_result && groupedResult.official_result.turnout_stats) {
              for (const key in groupedResult.official_result.turnout_stats) {
                finishMathObject(groupedResult.official_result.turnout_stats[key]);
              }
            }
            if (groupedResult.turnout_protocols_stats) {
              for (const dayKey in groupedResult.turnout_protocols_stats) {
                const date = groupedResult.turnout_protocols_stats[dayKey];
                for (const time in date) {
                  for (const dataKey in date[time]) {
                    finishMathObject(date[time][dataKey]);
                  }
                }
              }
            }
            if (groupedResult.metadata && groupedResult.metadata.voters) {
              if (groupedResult.metadata.voters.attached_percentage === null) {
                groupedResult.metadata.voters.attached_percentage = groupedResult.metadata.voters.attached_count / groupedResult.metadata.voters.registered_count * 100;
              }
            }
            const groupedEntries = [];
            Object.keys(groupedResult.entries).sort((a, b) => groupedResult.entries[b].official_result.votes_count - groupedResult.entries[a].official_result.votes_count).forEach((candidateKey) => {
              const candidate = groupedResult.entries[candidateKey];
              Object.keys(candidate.official_stats).forEach((statsKey) => {
                const stats = candidate.official_stats[statsKey];
                finishMathObject(stats);
              });
              groupedEntries.push(candidate);
            });
            groupedResult.entries = groupedEntries;
            assignPlaces(groupedResult, getWinnerCount(electoralDistrictType));
            groupedEntries.forEach((candidate) => {
              const transformer = (result) => {
                result.ratio_from_all_ballot_uiks = result.count / uiks.count.total * 100;
                if (result.ratio_from_koib_ballot_uiks !== undefined) {
                  result.ratio_from_koib_ballot_uiks = result.count / candidate.official_koib_stats.count.total * 100;
                }
                result.votes_weight = result.votes_count / candidate.official_result.votes_count * 100;
                if (result.valid_result_by_uik) {
                  result.valid_result_by_uik = sortKeysByValueDesc(result.valid_result_by_uik);
                }
                return result;
              };
              const sorter = (a, b) => {
                const place1 = parseFloat(a.substring(1));
                const place2 = parseFloat(b.substring(1));
                const diff1 = Math.abs(place1 - candidate.official_result.place);
                const diff2 = Math.abs(place2 - candidate.official_result.place);
                if (diff1 != diff2) {
                  return diff1 < diff2 ? -1 : 1;
                }
                return place1 < place2 ? -1 : 1;
              };
              const uiks = candidate.official_uik_stats;
              uiks.places = sortKeys(uiks.places, transformer, sorter);
              for (const key in uiks.repeated_percentages) {
                if (!uiks.repeated_percentages.hasOwnProperty(key)) {
                  continue;
                }
                const percentages = uiks.repeated_percentages[key];
                uiks.repeated_percentages[key] = sortKeys(percentages, transformer, (a, b) => {
                  a = percentages[a];
                  b = percentages[b];
                  const aRatio = a.votes_count / candidate.official_result.votes_count;
                  const bRatio = b.votes_count / candidate.official_result.votes_count;
                  return aRatio !== bRatio ? (aRatio < bRatio ? 1 : -1) : a.count !== b.count ? (a.count < b.count ? 1 : -1) : 0;
                }, (key) => key + '%', (key) => {
                  let obj = percentages[key]
                  return obj.count > 1;
                });
              }
              uiks.weights = sortKeysByValueDesc(uiks.weights, (value) => value / candidate.official_result.votes_count * 100);
              const koibs = candidate.official_koib_stats;
              if (koibs) {
                if (koibs.count.total == 0) {
                  delete candidate.official_koib_stats;
                } else {
                  koibs.places = sortKeys(koibs.places, transformer, sorter);
                  koibs.weights = sortKeysByValueDesc(koibs.weights, (value) => value / candidate.official_result.votes_count * 100);
                }
              }
            });

            if (groupedResult.metadata.voters && groupedResult.metadata.voters.registered_count) {
              ['', 'valid', 'invalid', 'lost', 'walk_by', 'on_home', 'ahead_of_time', 'taken_home'].forEach((key) => {
                groupedResult.official_result.turnout[(key.length ? key + '_' : '') + 'percentage'] = groupedResult.official_result.turnout[(key.length ? key + '_' : '') + 'count'] / groupedResult.metadata.voters.registered_count * 100;
              });
            } else {
              ['', 'valid', 'invalid', 'lost', 'walk_by', 'on_home', 'ahead_of_time', 'taken_home'].forEach((key) => {
                groupedResult.official_result.turnout[(key.length ? key + '_' : '') + 'percentage'] = 0;
              });
            }

            Object.keys(groupedResult.effective_uiks).forEach((uikId) => {
              const uikShortInfo = groupedResult.effective_uiks[uikId];
              if (arrayEquals(groupedResult.official_result.winner.id, uikShortInfo.official_result.uik_winner.id)) {
                uikShortInfo.official_result = uikShortInfo.official_result.uik_winner.valid_percentage;
              } else {
                const uikResult = data.results_by_uik[uikId][electoralDistrictType][electoralDistrictId];
                const parentWinnerInfo = uikShortInfo.official_result[parentWinnerKey];
                const copyInfoKeys = ['place', 'percentage', 'valid_percentage', 'registered_percentage'];
                if (Array.isArray(groupedResult.official_result.winner.id)) {
                  Object.assign(parentWinnerInfo, {
                    place: [],
                    percentage: [],
                    valid_percentage: [],
                    registered_percentage: []
                  });
                  for (let i = 0; i < groupedResult.official_result.winner.id.length; i++) {
                    const winnerId = groupedResult.official_result.winner.id[i];
                    const winnerPosition = groupedResult.official_result.winner.position[i];
                    try {
                      const uikCandidate = findCandidate(uikResult.entries, winnerId, winnerPosition);
                      copyInfoKeys.forEach((key) => {
                        parentWinnerInfo[key].push(uikCandidate.official_result[key]);
                      });
                    } catch (e) {
                      throw Error(electoralDistrictType + ', ' + electoralDistrictId + ', winnerId: ' + toJson(winnerId) + ', winnerPosition: ' + toJson(winnerPosition) + '\n== UIK ==\n' + toJson(uikResult) + '\n\n== ' + groupingLevel.toUpperCase() + ' ==' + '\n\n' + toJson(groupedResult));
                    }
                  }
                } else {
                  const uikCandidate = findCandidate(uikResult.entries, groupedResult.official_result.winner.id, groupedResult.official_result.winner.position);
                  if (!uikShortInfo.official_result[parentWinnerKey])
                    throw Error(parentWinnerKey + '\n' + toJson(uikShortInfo));
                  copyInfoKeys.forEach((key) => {
                    parentWinnerInfo[key] = uikCandidate.official_result[key];
                  });
                }
              }
            });
            if (groupedResult.effective_uiks) {
              groupedResult.effective_uiks = sortKeys(groupedResult.effective_uiks, null, (a, b) => {
                const uikA = groupedResult.effective_uiks[a];
                const uikB = groupedResult.effective_uiks[b];
                const p1 = typeof uikA.official_result === 'number' ? uikA.official_result : Array.isArray(uikA.official_result) ? arraySum(uikA.official_result) : uikA.official_result[parentWinnerKey].valid_percentage;
                const p2 = typeof uikB.official_result === 'number' ? uikB.official_result : Array.isArray(uikB.official_result) ? arraySum(uikB.official_result) : uikB.official_result[parentWinnerKey].valid_percentage;
                return p1 != p2 ? (p1 > p2 ? -1 : 1) : 0;
              }, (uikId) => 'УИК №' + uikId);
            }
          });
        });
      });
    });

    [data.results_by_district, data.results_by_gik].forEach((groupedData, groupedDataIndex) => {
      Object.keys(groupedData).forEach((electoralDistrictType) => {
        Object.keys(groupedData[electoralDistrictType]).forEach((electoralDistrictId) => {
          Object.keys(groupedData[electoralDistrictType][electoralDistrictId]).forEach((commissionId) => {
            const groupingLevel = groupedDataIndex == 1 ? 'gik' : 'district';
            const parentWinnerKey = groupingLevel + '_winner';

            const groupedResult = groupedData[electoralDistrictType][electoralDistrictId][commissionId];

            groupedResult.entries.forEach((candidate) => {
              const tikStats = {
                count: {
                  total: 0,
                  won: 0,
                  lost: 0,
                  win_rate: null
                },
                places: { },
                weights: { }
              };

              const districtStats = groupingLevel == 'gik' ? {
                count: {
                  total: 0,
                  won: 0,
                  lost: 0,
                  win_rate: null
                },
                places: { },
                weights: { }
              } : null;

              const processedDistricts = {};
              const tikIds = typeof groupedResult.related_to.tik === 'number' ? [groupedResult.related_to.tik] : groupedResult.related_to.tik;

              tikIds.forEach((tikId) => {
                const candidateId = candidate.party_id || candidate.candidate_id;
                const tikResult = data.results_by_tik[electoralDistrictType][electoralDistrictId][tikId];
                const tikCandidate = findCandidate(tikResult.entries, candidateId, candidate.position);

                tikStats.count.total++;
                if (tikCandidate.official_result.winner) {
                  tikStats.count.won++;
                } else {
                  tikStats.count.lost++;
                }
                tikStats.weights['ТИК №' + tikId] = tikCandidate.official_result.votes_count / candidate.official_result.votes_count * 100; // TODO tik

                const tikPlace = tikStats.places['#' + tikCandidate.official_result.place] || (tikStats.places['#' + tikCandidate.official_result.place] = {
                  count: 0,
                  ratio_from_all_ballot_tiks: null,
                  votes_count: 0,
                  votes_weight: null,
                  valid_result_by_tik: {}
                });
                tikPlace.count++;
                tikPlace.votes_count += tikCandidate.official_result.votes_count;
                tikPlace.valid_result_by_tik['ТИК №' + tikId] = tikCandidate.official_result.valid_percentage; // TODO tik

                if (districtStats) {
                  const tik = gik.tiks[tikId];
                  const tikAddressId = tik.address_id || tik.voting_address_id;
                  const district = allAddresses.entries[tikAddressId].address.district;
                  if (!processedDistricts[district]) {
                    processedDistricts[district] = true;

                    const districtResult = data.results_by_district[electoralDistrictType][electoralDistrictId][district];
                    const districtCandidate = findCandidate(districtResult.entries, candidateId, candidate.position);

                    districtStats.count.total++;
                    if (districtCandidate.official_result.winner) {
                      districtStats.count.won++;
                    } else {
                      districtStats.count.lost++;
                    }
                    districtStats.weights[district] = districtCandidate.official_result.votes_count / candidate.official_result.votes_count * 100;

                    const districtPlace = districtStats.places['#' + districtCandidate.official_result.place] || (districtStats.places['#' + districtCandidate.official_result.place] = {
                      count: 0,
                      ratio_from_all_ballot_districts: null,
                      votes_count: 0,
                      votes_weight: null,
                      valid_result_by_district: {}
                    });

                    districtPlace.count++;
                    districtPlace.votes_count += districtCandidate.official_result.votes_count;
                    districtPlace.valid_result_by_district[district] = districtCandidate.official_result.valid_percentage;
                  }
                }
              });

              tikStats.count.win_rate = tikStats.count.won / tikStats.count.total * 100;
              tikStats.weights = sortKeysByValueDesc(tikStats.weights);
              tikStats.places = sortKeys(tikStats.places, (place) => {
                place.ratio_from_all_ballot_tiks = place.count / tikStats.count.total * 100;
                place.votes_weight = place.votes_count / candidate.official_result.votes_count * 100;
                place.valid_result_by_tik = sortKeysByValueDesc(place.valid_result_by_tik);
                return place;
              }, (a, b) => {
                const place1 = parseFloat(a.substring(1));
                const place2 = parseFloat(b.substring(1));
                const diff1 = Math.abs(place1 - candidate.official_result.place);
                const diff2 = Math.abs(place2 - candidate.official_result.place);
                if (diff1 != diff2) {
                  return diff1 < diff2 ? -1 : 1;
                }
                return place1 < place2 ? -1 : 1;
              });
              candidate.official_tik_stats = tikStats;

              if (districtStats) {
                districtStats.count.win_rate = districtStats.count.won / districtStats.count.total * 100;
                districtStats.weights = sortKeysByValueDesc(districtStats.weights);
                districtStats.places = sortKeys(districtStats.places, (place) => {
                  place.valid_result_by_district = sortKeysByValueDesc(place.valid_result_by_district);
                  place.ratio_from_all_ballot_districts = place.count / districtStats.count.total * 100;
                  place.votes_weight = place.votes_count / candidate.official_result.votes_count * 100;
                  return place;
                }, (a, b) => {
                  const place1 = parseFloat(a.substring(1));
                  const place2 = parseFloat(b.substring(1));
                  const diff1 = Math.abs(place1 - candidate.official_result.place);
                  const diff2 = Math.abs(place2 - candidate.official_result.place);
                  if (diff1 != diff2) {
                    return diff1 < diff2 ? -1 : 1;
                  }
                  return place1 < place2 ? -1 : 1;
                });
                candidate.official_district_stats = districtStats;
              }
            });
          });
        });
      });
    });

    [
      data.elections,
      data.electoral_districts,
      data.candidates,
      data.parties
    ].forEach((dataMap) => {
      Object.keys(dataMap).forEach((dataKey) => {
        const dataItem = dataMap[dataKey];
        const relatedToUikCount = dataItem.related_to.uik ? (Array.isArray(dataItem.related_to.uik) ? dataItem.related_to.uik.length : 1) : 0;
        if (relatedToUikCount == (gik.stats.uik_count + gik.stats.empty_uik_count)) {
          dataItem.related_to.uik = 'all';
        }
        const relatedToTikCount = dataItem.related_to.tik ? (Array.isArray(dataItem.related_to.tik) ? dataItem.related_to.tik.length : 1) : 0;
        if (relatedToTikCount == gik.stats.tik_count) {
          dataItem.related_to.tik = 'all';
        }
      });
    });

    // Finding potential sibling connections
    gik.stats.all_members = findSiblingConnections(data);

    // Set violation stats
    for (const violationId in violationsMap) {
      const violation = violationsMap[violationId];
      gik.stats.total_violation_reports_count = (gik.stats.total_violation_reports_count || 0) + 1;

      const targetCommission = violation.related_to_uik ? uikMap[violation.related_to_uik] : violation.related_to_tik ? gik.tiks[violation.related_to_tik] : gik;
      const target = targetCommission.violation_reports || (targetCommission.violation_reports = {
        ids: []
      });
      target.ids.push(violation.id);
      for (const type in violation.violations) {
        const list = violation.violations[type];
        const existingList = target[type];
        if (existingList) {
          list.forEach((item) => {
            if (!existingList.includes(item)) {
              existingList.push(item);
            }
          })
        } else {
          target[type] = [... list];
        }
      }
      if (violation.threats) {
        const res = target.threats || (target.threats = {});
        Object.assign(res, violation.threats);
      }
      if (violation.complaints) {
        const res = target.complaints || (target.complaints = {});
        Object.assign(res, violation.complaints);
      }
      targetCommission.stats.violation_reports_count = (targetCommission.stats.violation_reports_count || 0) + 1;
      let parent = targetCommission.parent_commission;
      while (parent) {
        const commission = parent.type === 'tik' ? gik.tiks[parent.id] : gik;
        let key = targetCommission.type + '_violation_reports_count';
        commission.stats[key] = (commission.stats[key] || 0) + 1;
        key = targetCommission.type + '_with_violations';
        let tg = commission[key] || (commission[key] = {});
        tg = tg[targetCommission.id] || (tg[targetCommission.id] = []);
        tg.push(violation.id);
        parent = parent.parent_commission;
      }
    }

    data.version.date.finished = Date.now();

    console.log('Successfully finished all calculations in', (data.version.date.finished - data.version.date.started) / 1000, 'seconds');

    const dataKeys = Object.keys(data);
    for (let dataKeyIndex = 0; dataKeyIndex < dataKeys.length; dataKeyIndex++) {
      const dataKey = dataKeys[dataKeyIndex];
      const fileName = fileMap[dataKey];
      if (!fileName)
        throw Error('Unknown data key ' + dataKey);
      const dataToSave = data[dataKey];
      if (typeof fileName === 'object') {
        const nestedSave = async (filePath, level, data) => {
          for (const key in data) {
            if (data.hasOwnProperty(key)) {
              if (level === 1) {
                await saveJsonFile(path.join(filePath, key + '.json'), data[key]);
              } else {
                await nestedSave(path.join(filePath, key), level - 1, data[key]);
              }
            }
          }
        };
        await nestedSave(path.join('data', REGION_NAME, fileName.folder), fileName.level, dataToSave);
      } else {
        await saveJsonFile(path.join('data', REGION_NAME, fileName), dataToSave);
      }
    }

    console.log('Successfully saved all calculations in', (Date.now() - data.version.date.finished) / 1000, 'seconds');
  }

  // Step 1.1. Static data
  data.violations = staticViolations;

  // Step 2. Build reports per each commission
  await buildHtmlReport(data);

  // Step 3. Launch the bot.

  await launchBot(TELEGRAM_API_TOKEN, data);

  // Step 4. Is there a step 4?
})().catch((e) => {
  console.log(e);
});