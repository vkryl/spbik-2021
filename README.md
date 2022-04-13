# Результаты выборов СПбИК 2021

## **[🌐 Switch to English](/README.en.md)**

### [📈 Перейти к графикам](#user-content-результаты-и-графики)<br/>[🤖 Бот в Telegram](https://t.me/spbik_bot)

![помощники военных преступников](/images/fascist-crap.jpg)

С 17 по 19 сентября 2021 года в Санкт-Петербурге проходили выборы, в ходе которых фальсификаторы украли большинство округов у избирателей под формальным руководством зампреда горизбиркома [Егоровой Аллы Викторовны](http://www.st-petersburg.izbirkom.ru/izbiratelnye-komissii2/sank-peterburgskaya-izbiratelnaya-komissiya/sozyv2017-2022/egorova-alla-viktorovna/).

Проходили следующие виды голосований:

* В [ЗакС VII созыва](https://ru.wikipedia.org/wiki/%D0%97%D0%B0%D0%BA%D0%BE%D0%BD%D0%BE%D0%B4%D0%B0%D1%82%D0%B5%D0%BB%D1%8C%D0%BD%D0%BE%D0%B5_%D1%81%D0%BE%D0%B1%D1%80%D0%B0%D0%BD%D0%B8%D0%B5_%D0%A1%D0%B0%D0%BD%D0%BA%D1%82-%D0%9F%D0%B5%D1%82%D0%B5%D1%80%D0%B1%D1%83%D1%80%D0%B3%D0%B0) (25 одномандатных округов + голосование по партиям)
* В [Госдуму VIII созыва](https://ru.wikipedia.org/wiki/%D0%93%D0%BE%D1%81%D1%83%D0%B4%D0%B0%D1%80%D1%81%D1%82%D0%B2%D0%B5%D0%BD%D0%BD%D0%B0%D1%8F_%D0%B4%D1%83%D0%BC%D0%B0_%D0%A4%D0%B5%D0%B4%D0%B5%D1%80%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B3%D0%BE_%D1%81%D0%BE%D0%B1%D1%80%D0%B0%D0%BD%D0%B8%D1%8F_%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D0%B9%D1%81%D0%BA%D0%BE%D0%B9_%D0%A4%D0%B5%D0%B4%D0%B5%D1%80%D0%B0%D1%86%D0%B8%D0%B8_VIII_%D1%81%D0%BE%D0%B7%D1%8B%D0%B2%D0%B0) (8 одномандатных округов + голосование по партиям)
* В [МО Автово](http://moavtovo.ru/) (4 многомандатных округа, 19 участковых комиссий ТИК №41)
* В [МО Ланское](http://xn--80akoclht.xn--p1ai/) (многомандатный округ №2, УИК 1798, 1801, 1800, 1806, 1809, относятся к ТИК №9)

В этом репозитории содержатся данные всех протоколов, связанных с ними, а так же адреса комиссий, их составы, предполагаемые родственные связи среди других избирательных комиссий города и сообщения с [карты нарушений «Голоса»](https://www.kartanarusheniy.org/2021-09-19/list).

## Содержание репозитория

* **Для разработчиков и исследователей:** все результаты, протоколы явки, адреса комиссий и составы в формате JSON файлов, которые можно использовать для разработки аналитических и просветительских проектов. В файлах составов комиссий есть списки предполагаемых родственников среди составов других комиссий города.
* **Как пример, что с ними можно сделать:** исходный код бота [@spbik_bot](https://t.me/spbik_bot), одна из его основных возможностей — генерация графиков, на которых наглядна динамика роста результата по протоколам и то, каким комиссиям СПбИК раздала [благодарности](/docs/official-gratefulness.pdf), [почётные грамоты](/docs/certificate-of-honour.pdf) и [знаки «за активную работу на выборах»](/docs/badges.pdf).
* **Для всех любознательных:** ниже в этом README собрано описание того, какое значение имеют конкретные украденные виды выборов, графики, сгенерированные [ботом](https://t.me/spbik_bot), и краткое описания происходящего на них. То есть даже для тех, кто ни разу не ходил на выборы и не знает, что такое ЗакС.

Если вы просто хотите посмотреть результат комиссии, в которую ходили, или общий результат по вышестоящей ТИК, пришлите номер комиссии или округа [боту](https://t.me/spbik_bot).

**Важно:** используются только данные, доступные в открытых источниках и документах. Никаких закрытых, незаконно добытых или сфальсифицированных нет. Вы можете перепроверить их на [izbirkom.ru](https://izbirkom.ru) и [vestnik.spbik.spb.ru](https://vestnik.spbik.spb.ru/).

## Цели проекта

* **Исследователям и расследователям** — немного упростить работу над результатами выборов в 2021 году в Санкт-Петербурге. Рано или поздно их выводы и находки станут востребованы, а этот репозиторий можно использовать для того, чтобы собрать все в одном месте.
* **Разработчикам и дизайнерам** — немного упростить создание просветительских проектов, нахождение способов объяснить конкретные фальсификации как можно большему количеству людей, не разбирающихся в процедуре выборов. Это может быть что угодно: от листовок, объясняющих присутствие того или иного нелегитимного депутата в ЗакСе, Госдуме, голосующего по указке, до визуализаций результатов (в том числе анимированных), сайтов и ресурсов, дающих возможность самостоятельно вникнуть в фальсификации. Так же можно переиспользовать наработки для других регионов.
* **Всем** — в лишний раз напомнить и зафиксировать, что выборы в Санкт-Петербурге были украдены, и чтобы не было сомнений в том, насколько дико и открыто. Если у вас есть англоязычные знакомые, им можно прислать ссылку на этот репозиторий, чтобы они могли самостоятельно погрузиться в устройство избирательной системы северной столицы России.

## Лицензия

Для [исходного кода бота](/main.js) используется [GNU LGPLv3](/LICENCE), при этом:

* [Файлы JSON](/data) можно брать без каких-либо условий. Если они окажутся вам полезными в какой-либо работе или исследовании, можете просто указать ссылку на этот репозиторий или поддержать (способы ниже).
* Вместо копирования этих файлов, лучше подключить этот репозиторий как [субмодуль git](https://git-scm.com/book/en/v2/Git-Tools-Submodules), чтобы в вашей работе автоматически была ссылка на этот репозиторий и используемый коммит, и не было необходимости копировать в свой репозиторий тысячи файлов.
* Если хотите добавить фичу в бота, добавить новый вид графиков или исправить ошибку, можете открыть Pull Request.
* Если вы хотите использовать бота с изменениями (например, для других регионов), форкните его средствами GitHub, чтобы можно было найти в поиске, и укажите список изменений в файле README.

## Благодарности

Спасибо избирателям, пришедшим на участки, не поддавшимся выученной беспомощности. Без них избирательным комиссиям не пришлось бы идти на преступления и было бы достаточно административного ресурса, пропаганды и голосов тех, кто получает выгоду от текущего режима.

Особенно хочется поблагодарить тех, кто боролся в достижении честного результата: в статусе СМИ, наблюдателей, членов комиссий, судебных истцов и свидетелей фальсификаций, или любом другом. За счёт вас во многих округах возможно понять реальную картину.

За счёт их общих усилий и [графиков](https://t.me/spbik_bot) можно найти ответ, почему Роскомнадзор усердно боролся с доступностью [Умного Голосования](https://votesmart.appspot.com), используя [незаконные блокировки](https://habr.com/post/598265/) и [давление ФСБ на сотрудников Google](https://www.washingtonpost.com/world/2022/03/12/russia-putin-google-apple-navalny/).

Узнать точно, существуют ли действительно все более 60% избирателей, не пришедших на участки, невозможно. Но, исходя из графиков в некоторых округах, вероятнее всего, победители могли бы быть другими, если бы все они поддержали стратегию [Умного Голосования](https://votesmart.appspot.com).

Отдельное спасибо ТИК №9 (МО Ланское), в участковых комиссиях которого применялись все возможные виды фальсификаций, а честных протоколов меньше количества пальцев на одной руке (за счёт них Единая Россия показала лучший результат среди всех ТИК города). Без её наглости преступлений этот проект бы не возник.

## Поддержать создателя проекта

Данный проект появился на искреннем любопытстве и желании узнать несколько вещей:

1. Реальную поддержку разных кандидатов и партий среди жителей Санкт-Петербуга
2. Кто, вероятнее всего, победил бы, если бы не было тотальных фальсификаций
3. Как много людей проголосовали [по-умному](https://votesmart.appspot.com), несмотря на то, как [Роскомнадзор](https://habr.com/post/598265/) и [ФСБ](https://www.washingtonpost.com/world/2022/03/12/russia-putin-google-apple-navalny/) пытались ограничить доступ к рекомендациям проекта.

К сожалению или счастью, ни запад, ни пятые колонны, ни НАТО не участвовали в этой разработке. Никакие национал-предатели, любители фуа-гра и залетевшие в рот России мошки её не спонсировали.

Если вам лично понравился этот проект или захотите, чтобы таких проектов стало больше (идей много, а времени мало), можете сделать пожертвование любого размера через криптовалюту или PayPal:

**BTC**: `bc1qgfxx7hpwslxf7p3vvrmze8mxm5z3l26zx2mt6r`  
**ETH**: `0x9373E9DB2E18A1CFc7d370ecd2cc607b63ad697b`  
**[TON](https://ton.org)**: `EQDIChbAdWuLMNQhkDqhLVNP2O2kWTGpEIVbl7DqMvvk0RZF`  
**PayPal**: [paypal.me/notamouranth](https://paypal.me/notamouranth)

# Результаты и графики

Если вы не знакомы с деталями устройства избирательных комиссий (например, не ходили на выборы или не из РФ), и хотите наиболее коротко узнать, как они технически устроены:

<details>
<summary><b>Процесс голосования и участки</b></summary>

То место, куда приходят избиратели и кидают бюллетень в урну — участковые избирательные комиссии (коротко — УИК). Каждый избиратель привязан к определённому УИК по прописке, узнать конкретный может, например, с помощью [сервиса ЦИК](http://cikrf.ru/digital-services/naydi-svoy-izbiratelnyy-uchastok/).

В день выборов избиратель приходит на участок, в котором за столами сидят члены комиссии. Рядом с каждым из столов — диапазоны адресов. Избиратель ищет тот, который относится к его прописке, подходит к нужному, затем ищут его данные в **книгах избирателей**. Если его нет в книгах избирателей, но прописка точно верная, (такое бывает), его вносят от руки в дополнительный список.

Затем избиратель выбирает тех, кого хочет, в бюллетенях, и кидает в урну (или просто уносит их).

Бывают участки за рубежом (на территориях консульств, посольств), в них можно прийти без предварительной записи и прописки. Было шесть УИК, привязанных к разным округам Санкт-Петербурга:

1. 🇩🇪 **УИК 8317** — генконсульство в Лейпциге, Германия — привязан к 217 округу Госдумы
2. 🇩🇪 **УИК 8413** — генконсульство в Бонне, Германия — привязан к 211 округу Госдумы
3. 🇩🇪 **УИК 8429** — там же — 213 округ Госдумы
4. 🇩🇪 **УИК 8425** — там же — 214 округ Госдумы
5. 🇩🇪 **УИК 8418** — там же — 216 округ Госдумы
6. 🇧🇬 **УИК 8050** — посольство в Софии, Болгария — привязана к 217 округу

Человек, пришедший в участковую комиссию, получал от одного до пяти бюллетеней:

* При голосовании по прописке на своём участке человек получал 4 бюллетеня, 5 — если проводились муниципальные выборы
* При голосовании по открепительному с пропиской другого региона избиратель полулчал только 1 бюллетень — Госдума, партии.
* При голосовании по открепительному с пропиской в том же одномандатном округе Госдумы человек мог получить 2-й бюллетень — по одномандатному округу Госдумы.
* По ЗакСу открепительных не было, поэтому в пределах одной комиссии количество задействованных бюллетеней по ЗакСу не может существенно превышать то же количество по Госдуме. Незначительно — на пару человек — может, например, в случае, если были люди, отказавшиеся голосовать по Госдуме, и просившие бюллетени только по ЗакСу. Таких людей очень мало.
* При голосовании за рубежом человек мог голосовать только по партийным спискам Госдумы, по одномандатным округам — только если была прописка (но на деле многие консульства отказывали в выдаче такого бюллетеня)

***

</details>

Наиболее объемно конкретные виды фальсификаций, использованных на выборах в сентябре в Санкт-Петербурге, собраны в [отчёте Наблюдателей Петербурга](/docs/spb-elections-review-2021.pdf). Если же вы хотите кратко ознакомиться со способами фальсификаций:

<details>
<summary><b>Методы фальсификаций и их следы в протоколах</b></summary>

Используемые методы фальсификации итогов выборов конкретных участковых избирательных комиссий, как правило, зависят от территориальных избирательных комиссий (ТИК), к которым участки относятся. Ниже описаны основные виды.

### 0. Препятствия и отказ в регистрации кандидатов.

Важно отметить, что ниже — описание устройства фальсификаций на этапе голосования. При этом значительную роль в получении нужного результата играет подготовка к нему: например, незаконные ограничения в пассивном избирательном праве. Про них можно почитать, например, в [отчёте Голоса](https://www.golosinfo.org/articles/145498).

### 1. Вброс бюллетеней.

Заключается в том, что в урне бюллетеней оказывается больше, чем проголосовало избирателей в действительности.

**Нельзя вбросить просто так.** Если найти пачку бюллетеней и пойти в УИК, в котором не планируются фальсификации, и вбросить её, предварительно не сговорившись с хотя бы одним членом комиссии, то стационарный ящик или соответствующий сейф-пакет просто аннулируют при подсчёте количества бюллетеней, потому что оно будет больше, чем было выдано по книгам избирателей.

Поэтому на записях вбросов бюллетеней преступник не только тот, кто непосредственно вбрасывает: он действует не один. Преступником должен быть, как минимум, один член комиссии, который "подобьет" свою книгу избирателей, чтобы количество выданных бюллетеней билось или было больше количества реальных и вброшенных.

На деле же, как правило, это невозможно сделать без ведома других членов комиссии, потому что каждый видит, кто и сколько бюллетеней выдаёт.

**Как определить по протоколу:** есть несколько способов. Основной: за счёт сравнения явки со средней по ТИК, району или городу, здесь хорошо работает [метод Шпилькина](https://ru.wikipedia.org/wiki/Шпилькин,_Сергей_Александрович#Методика_статистического_анализа_результатов_выборов).

Иногда работает и другой способ: бывает, что фальсификаторы ошибаются и вбрасывают разное количество бюллетеней по разным видам голосований. Например, есть случаи, когда всех видов бюллетеней задействовано ровно по 100 больше, чем по голосованию по партиям по Госдуме. Это возможно объяснить тремя ровными вброшенными пачками по остальным видам голосований.

### 2. Замена сейф-пакета.

17-19 сентября использовалось нововведение: трёхдневное голосование. В первый и второй день голосования после закрытия участка бюллетени из урны упаковывались в сейф-пакет.

Формальная цель — профилактика от COVID. На деле — дать возможность фальсификаторам заменять сейф-пакет на тот, в котором будет достаточное количество нужных бюллетеней.

**Как определить:** по протоколам явки. Больше всего людей приходило в последний день (19.09), затем в первый (17.09), и меньше всего — во второй (18.09). Аномальная явка в первый или второй день, как правило, свидетельствует о том, что ночью пакет был заменён на нужный с нужным количеством бюллетеней. Замена сейф-пакета уменьшает количество проголосовавших за всех кандидатов, кроме нужного.

Отличить вброс от замены сейф-пакета возможно по явке за конкретные партии и кандидаты. При вбросе явка растёт только за конкретного кандидата / партию, оставаясь 

### 3. Рисования протоколов и нарушения процедуры подсчёта.

Заключается в том, что содержимое и количество бюллетеней игнорируется частично или полностью, а в итоговый протокол УИК вносятся произвольный результат.

Возможно определить по аномалиям в результате, сравнив с протоколами других комиссий, находившихся в том же помещении, или других ближайших комиссиях.

### 4. Переписывание протоколов в ТИК.

То же, что и обычное рисование протокола, отличается только тем, что УИК может огласить реальный результат, но не внести в ГАС "Выборы".

### 5. Карусельщики.

Человек получает бюллетени, несмотря на то, что не имеет на это право в конкретной участковой комиссии. Как правило, действуют группой, которая ездит по всем комиссиям конкретного ТИКа. В зависимости от комиссии и ситуации в ней (наличие независимых членов комиссий, наблюдателей) могут брать бюллетени как за одного человека, так и за нескольких.

Конкретного способа определить карусельщиков по протоколам нет.

***

</details>

## Законодательное собрание Санкт-Петербурга

[ЗакС Санкт-Петербурга](https://ru.wikipedia.org/wiki/Законодательное_собрание_Санкт-Петербурга) обладает [большим количеством полномочий](https://ru.wikipedia.org/wiki/Законодательное_собрание_Санкт-Петербурга#Полномочия): от принятия городских законов и утверждения бюджета до назначения [мировых судей](https://ru.wikipedia.org/wiki/Мировой_суд_(Россия)) и судей [Уставного суда](https://ru.wikipedia.org/wiki/Уставный_суд_Санкт-Петербурга).

Особенное полномочие ЗакСа — назначать [членов Санкт-Петербургской Избирательной Комиссии](https://ru.wikipedia.org/wiki/Санкт-Петербургская_избирательная_комиссия), которая является вышестоящим органом, организующим выборы в Санкт-Петербурге, **в том числе в сам ЗакС**.

Такое полномочие исключает возможность иметь честные выборы в Санкт-Петербурге в принципе, так как вышестоящий орган, когда нужно, закроет глаза на все жалобы и нарушения.

Ниже приведены графики и описания к некоторым из них. Если вы не нашли график для вашего округа, вы можете найти его в [боте](https://t.me/spbik_bot). Если вы хотите узнать больше о формально победивших кандидатах, вы можете прочитать [материал ЗакС.ру о депутатах](https://www.zaks.ru/new/archive/view/218253). 

### Связь ЗакСа с Советом Федерации

На федеральном уровне ЗакС важен тем, что наделяет полномочиями одного сенатора [Совета Федерации](https://ru.wikipedia.org/wiki/Совет_Федерации). Одно из самых важных последних решений Совета Федерации, например, единогласное одобрение `22.02.2022` [использования российских войск за границей в неопределённом месте на неопределённый срок](/docs/council-22.0.2022.pdf).

От ЗакСа Санкт-Петербурга сенатором назначен **[Андрей Кутепов](https://www.zaks.ru/new/person/view/5035)**, считающий, что "санкции, вводимые против России из-за вторжения в Украину, [идут только на пользу народу России](https://t.me/zaksru/3777)".

Всего в Совете Федерации 200 сенаторов: 30 назначаемых напрямую президентом РФ и по два от каждого из 85 субъектов (один — от исполнительной ветви власти, другой — от законодательной).

Второй сенатор от Санкт-Петербурга — [Валентина Матвиенко](https://www.youtube.com/watch?v=p2gNZrfmcVU), председатель Совета Федерации — назначена Бегловым, "избранным" той же Санкт-Петербургской избирательной комиссией в 2019 году.

***

**Примечание:** ниже перечислены краткие описания только для некоторых одномандатные округов. Для каждого из округов возможно написать полный разбор каждого ТИК со всеми ссылками на все сообщения наблюдателей и анализом, почему именно конкретный депутат был выбран фальсификаторами. Если хотите как-либо улучшить этот раздел, можете предложить улучшения через pull request.

***

![ЗакС: 21 Округ](/images/charts/ru/city-21.jpg)

В округе №21 выдвигался [**Максим Резник**](https://ru.wikipedia.org/wiki/%D0%A0%D0%B5%D0%B7%D0%BD%D0%B8%D0%BA,_%D0%9C%D0%B0%D0%BA%D1%81%D0%B8%D0%BC_%D0%9B%D1%8C%D0%B2%D0%BE%D0%B2%D0%B8%D1%87), депутат ЗакСа 6-го созыва: [YouTube канал](https://www.youtube.com/user/maximreznik),[Telegram](https://t.me/maximreznik), [ролик о выдвижении](https://www.youtube.com/watch?v=w1X9W_eTz8w), [сайт кампании](http://maximreznik.ru/).

С помощью [сфабрикованного](https://www.severreal.org/a/31163212.html) уголовного дела его задержали **[на следующий день](https://www.zaks.ru/new/archive/view/214173) после назначения даты выборов в ЗакС** и посадили под домашний арест, а следователь [незаконно отказал в допуске к нотариусу](https://www.fontanka.ru/2021/07/08/70015028/), сделав сбор подписей и выдвижение невозможным.

В округе выдвинулась **Ольга Галкина**, известный политик и депутат [ЗакСа 5-го созыва](http://www.assembly.spb.ru/authors/show/635516516). По завершению голосования 19 сентября в 20:00 председатели некоторых комиссий сбегали без оглашения результатов, после чего в вышестоящих ТИК в течение следующих 14 часов [нарисовали нужные результаты](https://www.zaks.ru/new/archive/view/217929).

На графике можно наглядно увидеть аномальное влияние таких переписанных протоколов, поднявших Андрея Малкова **с последнего на первое место**.

Андрей Малков участвовал в [мониторинге состояния СКК "Петербургский"](https://vk.com/wall497455_5161) перед его [скандальным сносом](https://www.fontanka.ru/2021/01/31/69738746/) (объект находился на территории округа) и активном комментировании [проекта "СКА-Арена"](https://vk.com/wall-16672464_12953) — после сноса. О "самом большом в мире ледовом дворце" на этом месте [мечтают с 2018 года](https://sportrbc.ru/news/614b3a249a7947761e023a29) друзья Владимира Путина: Геннадий Тимченко и Роман Ротенберг.

***

![ЗакС: 3 Округ](/images/charts/ru/city-3.jpg)

В округе №3 наиболее яркую кампанию провела Ирина Фатьянова, собрав более 4 тысяч подписей жителей округа. Её статус кандидатки ТИК №18 [аннулировал по несуществующей в законе процедуре](https://paperpaper.ru/vidimo-poyavilsya-strah-chto-soberu-pod/) в последние дни сбора подписей, а СПбИК [подтвердил это решение](https://t.me/fatyanovawithlove/667).

После отказа в регистрации Ирина призвала [голосовать по-умному](https://t.me/fatyanovawithlove/685) и провела кампанию по наблюдению на выборах.

Так же до бюллетеня не допустили кандидатку Ксению Михайлову [решением горсуда](https://www.yabloko.ru/regnews/Spb/2021/09/07), который удовлетворил иск кандидата от КПРФ, ссылаясь на отсутствие несуществующего в законе документа «о повторном выдвижении».

В округе №3 применялись все виды фальсификаций и использовалось административное давление на наблюдателей, включая удаления с участков. С помощью них нарисовали победу дочери [Вячеслава Макарова](https://ru.wikipedia.org/wiki/Макаров,_Вячеслав_Серафимович) — Марине Макаровой (сменившей на время выборов фамилию на "Лыбанева").

На графике слева направо до УИК №1652 — наиболее честные протоколы. Правее от них до УИК №1807 видно, что темп роста количества голосов меняется только за Марину, а за остальных кандидатов остаётся одинаковым: это вбросы. Следом — участки, где заменили сейф-пакет или нарисовали протокол (темп за Марину увеличивается, а за остальных кандидатов — равномерно уменьшается).

*** 

![ЗакС: 2 Округ](/images/charts/ru/city-2.jpg)

В округе №2 выдвигался [Борис Лазаревич Вишневский](https://ru.wikipedia.org/wiki/Вишневский,_Борис_Лазаревич), депутат ЗакСа с 2011 года: [сайт](http://visboris.ru), [Telegram канал](https://t.me/visboris).

Вместе с ним были зарегистрированы [его двойники](https://meduza.io/news/2021/09/06/dvoyniki-borisa-vishnevskogo-zayavivshiesya-na-vybory-v-peterburge-podali-v-izbirkom-fotografii-kak-u-originala), сменившие специально имена на время выборов. 

По общему итогу СПбИК может показаться, что Борису Лазаревичу для победы не хватило голосов тех людей, что проголосовали по ошибке за его двойников, и ещё пары сотен. На деле у Бориса Лазаревича победу украли за счёт переписанных протоколов и каруселей в пользу кандидата Ржаненкова.

Борис Лазаревич всё равно стал депутатом ЗакСа, но за счёт голосования по партиям. 

***

![ЗакС: 6 Округ](/images/charts/ru/city-6.jpg)

В округе №6 победил [Михаил Амосов](https://ru.wikipedia.org/wiki/Амосов,_Михаил_Иванович) — один из трёх кандидатов на [выборах губернатора в 2019 году](https://ru.wikipedia.org/wiki/Выборы_губернатора_Санкт-Петербурга_(2019)).

Его победу не украли, но за счёт фальсификаций сильно сократили отрыв от следом идущего кандидата от Единой России. Вероятнее всего, чтобы скрыть реальную разницу в поддержке. Так один только УИК №509 принёс Дмитрию Васильеву 1,743 голосов.

<details>
<summary><b>Явка в УИК №573 по округу №6</b></summary>

![ЗакС: 6 Округ. УИК №509](/images/charts/ru/city-6-uik-509.png)

</details>

***

![ЗакС: 7 Округ](/images/charts/ru/city-7.jpg)

В округе №7 участвовала [Надежда Тихонова](https://www.zaks.ru/new/person/view/3093) — депутат ЗакСа предыдущего созыва и одна из трёх кандидатов на [выборах губернатора в 2019 году](https://ru.wikipedia.org/wiki/Выборы_губернатора_Санкт-Петербурга_(2019)).  За счёт [фальсификаций](https://vk.com/wall-29887880_9510) победа была нарисована [Елене Раховой](https://www.zaks.ru/new/person/view/3986/).

Наиболее заметно отличился УИК №573, нарисовав 100% явку (1,922 человека), 1,289 из которых якобы проголосовали за Елену Рахову. По протоколам явки 1,237 человек (67.86%) пришли в комиссию в первый день голосования (17.09), а в последний день (19.09) — только 69.

<details>
<summary><b>Явка в УИК №573 по округу №7</b></summary>

![ЗакС: 7 Округ. УИК №573](/images/charts/ru/city-7-uik-573.png)

</details>

***

![ЗакС: 24 Округ](/images/charts/ru/city-24.jpg)

Один из округов, где была нарисована победа кандидату не от Единой России.

***

<details>
<summary><b>Другие одномандатные округа Законодательного Собрания</b></summary>

![ЗакС: 1 Округ](/images/charts/ru/city-1.jpg)
![ЗакС: 4 Округ](/images/charts/ru/city-4.jpg)
![ЗакС: 5 Округ](/images/charts/ru/city-5.jpg)
![ЗакС: 8 Округ](/images/charts/ru/city-8.jpg)
![ЗакС: 9 Округ](/images/charts/ru/city-9.jpg)
![ЗакС: 10 Округ](/images/charts/ru/city-10.jpg)
![ЗакС: 11 Округ](/images/charts/ru/city-11.jpg)
![ЗакС: 12 Округ](/images/charts/ru/city-12.jpg)
![ЗакС: 13 Округ](/images/charts/ru/city-13.jpg)
![ЗакС: 14 Округ](/images/charts/ru/city-14.jpg)
![ЗакС: 15 Округ](/images/charts/ru/city-15.jpg)
![ЗакС: 16 Округ](/images/charts/ru/city-16.jpg)
![ЗакС: 17 Округ](/images/charts/ru/city-17.jpg)
![ЗакС: 18 Округ](/images/charts/ru/city-18.jpg)
![ЗакС: 19 Округ](/images/charts/ru/city-19.jpg)
![ЗакС: 20 Округ](/images/charts/ru/city-20.jpg)
![ЗакС: 22 Округ](/images/charts/ru/city-22.jpg)
![ЗакС: 23 Округ](/images/charts/ru/city-23.jpg)
![ЗакС: 25 Округ](/images/charts/ru/city-25.jpg)

</details>

<details>
<summary><b>Чудеса голосования по партиям (ЗакС)</b></summary>

Несмотря на то, что текущие графики роста количества голосов по УИКам не дают наглядно понять, какое распределение мест было бы без фальсификаций, можно однозначно увидеть сфальсифицированные протоколы, причём не всегда в пользу Единой России.

![ТИК 54](/images/charts/ru/city-parties-tik-54.jpg)

![ТИК 18](/images/charts/ru/city-parties-tik-18.jpg)

![ТИК 9](/images/charts/ru/city-parties-tik-9.jpg)

![ТИК 19](/images/charts/ru/city-parties-tik-19.jpg)

![ТИК 22](/images/charts/ru/city-parties-tik-22.jpg)

![ТИК 34](/images/charts/ru/city-parties-tik-34.jpg)

![ТИК 35](/images/charts/ru/city-parties-tik-35.jpg)

![ТИК 36](/images/charts/ru/city-parties-tik-36.jpg)

![ТИК 10](/images/charts/ru/city-parties-tik-10.jpg)

![ТИК 22](/images/charts/ru/city-parties-tik-20.jpg)

![ТИК 22](/images/charts/ru/city-parties-tik-62.jpg)

Графики для всех остальных ТИК можно найти в [соответствующей папке](/images/charts/ru).

</details>

<details>
<summary><b>Наглядные ошибки при фальсификациях</b></summary>

4 из 5 комиссий нагло рисовали несуществующую поддержку муниципальным депутатам от Единой России, но на графике можно заметить, что в УИК 1806 голоса одного из пяти единороссов приписаны кандидату от КПРФ.

![МО Ланское](/images/charts/ru/municipality-Ланское-2.jpg)

Как так вышло? Ответ прост — кандидат от КПРФ находится на одну строчку выше кандидата, который победил за счёт фальсификаций. Вероятнее всего, колоссальную поддержку в этой комиссии ему приписали случайно, промахнувшись на строчку.

![МО Ланское: таблица](/images/charts/ru/municipality-Ланское-2-table.jpg)

***

На следующем графике можно заметить, как в УИК 1798 и 1805 результат КПРФ при голосовании по партиям Госдумы приписан Коммунистам России (красные и коричневые прямоугольники).

![ТИК 9: партии ГД](/images/charts/ru/federal-parties-tik-9-bars.jpg)

В "пограничных" участках (как 1796 на предыдущем графике) можно заметить протоколы, в которых есть аномально много недействительных или унесённых домой бюллетеней. Обычно такие аномалии — следствие заранее подготовленных пачек бюллетеней, которые не смогли вбросить (например, из-за активности наблюдателей). Такую картину можно встретить в других ТИК, где есть хотя бы несколько честных протоколов.

</details>

<details>
<summary><b>Одномандатные округа Госдумы</b></summary>

<details>
<summary><b>Общая картина (детально анализировать следует в графиках по ТИК)</b></summary>

![ГД: 211 Округ](/images/charts/ru/federal-211.jpg)
![ГД: 212 Округ](/images/charts/ru/federal-212.jpg)
![ГД: 213 Округ](/images/charts/ru/federal-213.jpg)
![ГД: 214 Округ](/images/charts/ru/federal-214.jpg)
![ГД: 215 Округ](/images/charts/ru/federal-215.jpg)
![ГД: 216 Округ](/images/charts/ru/federal-216.jpg)
![ГД: 217 Округ](/images/charts/ru/federal-217.jpg)
![ГД: 218 Округ](/images/charts/ru/federal-218.jpg)

</details>

<details>
<summary><b>Графики округа №211 по ТИК (Центральный район)</b></summary>

![ГД: 211 Округ](/images/charts/ru/federal-211-tik-30.jpg)
![ГД: 211 Округ](/images/charts/ru/federal-211-tik-64.jpg)

</details>

<details>
<summary><b>Графики округа №211 по ТИК (Невский район)</b></summary>

![ГД: 211 Округ](/images/charts/ru/federal-211-tik-5.jpg)
![ГД: 211 Округ](/images/charts/ru/federal-211-tik-24.jpg)
![ГД: 211 Округ](/images/charts/ru/federal-211-tik-49.jpg)
![ГД: 211 Округ](/images/charts/ru/federal-211-tik-50.jpg)
![ГД: 211 Округ](/images/charts/ru/federal-211-tik-51.jpg)
![ГД: 211 Округ](/images/charts/ru/federal-211-tik-52.jpg)
![ГД: 211 Округ](/images/charts/ru/federal-211-tik-53.jpg)

</details>

<details>
<summary><b>Графики округа №212 по ТИК (Кировский район)</b></summary>

![ГД: 212 Округ](/images/charts/ru/federal-212-tik-7.jpg)
![ГД: 212 Округ](/images/charts/ru/federal-212-tik-42.jpg)

</details>

<details>
<summary><b>Графики округа №212 по ТИК (Красносельский район)</b></summary>

![ГД: 212 Округ](/images/charts/ru/federal-212-tik-6.jpg)
![ГД: 212 Округ](/images/charts/ru/federal-212-tik-26.jpg)
![ГД: 212 Округ](/images/charts/ru/federal-212-tik-46.jpg)
![ГД: 212 Округ](/images/charts/ru/federal-212-tik-47.jpg)


</details>

<details>
<summary><b>Графики округа №212 по ТИК (Петродворцовый район)</b></summary>

![ГД: 212 Округ](/images/charts/ru/federal-212-tik-8.jpg)
![ГД: 212 Округ](/images/charts/ru/federal-212-tik-55.jpg)

</details>

<details>
<summary><b>Графики округа №213 по ТИК (Калининский район)</b></summary>

![ГД: 213 Округ](/images/charts/ru/federal-213-tik-17.jpg)
![ГД: 213 Округ](/images/charts/ru/federal-213-tik-37.jpg)
![ГД: 213 Округ](/images/charts/ru/federal-213-tik-39.jpg)

</details>

<details>
<summary><b>Графики округа №213 по ТИК (Выборгский район)</b></summary>

![ГД: 213 Округ](/images/charts/ru/federal-213-tik-10.jpg)
![ГД: 213 Округ](/images/charts/ru/federal-213-tik-14.jpg)
![ГД: 213 Округ](/images/charts/ru/federal-213-tik-22.jpg)
![ГД: 213 Округ](/images/charts/ru/federal-213-tik-34.jpg)
![ГД: 213 Округ](/images/charts/ru/federal-213-tik-35.jpg)
![ГД: 213 Округ](/images/charts/ru/federal-213-tik-36.jpg)

</details>

<details>
<summary><b>Графики округа №214 по ТИК (Калининский район)</b></summary>

![ГД: 214 Округ](/images/charts/ru/federal-214-tik-11.jpg)
![ГД: 214 Округ](/images/charts/ru/federal-214-tik-38.jpg)
![ГД: 214 Округ](/images/charts/ru/federal-214-tik-40.jpg)

</details>

<details>
<summary><b>Графики округа №214 по ТИК (Красногвардейский район)</b></summary>

![ГД: 214 Округ](/images/charts/ru/federal-214-tik-4.jpg)
![ГД: 214 Округ](/images/charts/ru/federal-214-tik-25.jpg)
![ГД: 214 Округ](/images/charts/ru/federal-214-tik-44.jpg)
![ГД: 214 Округ](/images/charts/ru/federal-214-tik-45.jpg)

</details>

<details>
<summary><b>Графики округа №215 по ТИК (Приморский район)</b></summary>

![ГД: 215 Округ](/images/charts/ru/federal-215-tik-9.jpg)
![ГД: 215 Округ](/images/charts/ru/federal-215-tik-12.jpg)
![ГД: 215 Округ](/images/charts/ru/federal-215-tik-28.jpg)
![ГД: 215 Округ](/images/charts/ru/federal-215-tik-56.jpg)
![ГД: 215 Округ](/images/charts/ru/federal-215-tik-57.jpg)
![ГД: 215 Округ](/images/charts/ru/federal-215-tik-58.jpg)

</details>

<details>
<summary><b>Графики округа №215 по ТИК (Курортный и Кронштадтский район)</b></summary>

![ГД: 215 Округ](/images/charts/ru/federal-215-tik-13.jpg)
![ГД: 215 Округ](/images/charts/ru/federal-215-tik-15.jpg)

</details>

<details>
<summary><b>Графики округа №216 по ТИК (Центральный район)</b></summary>

![ГД: 216 Округ](/images/charts/ru/federal-216-tik-16.jpg)
![ГД: 216 Округ](/images/charts/ru/federal-216-tik-64.jpg)

</details>

<details>
<summary><b>Графики округа №216 по ТИК (Василеостровский район)</b></summary>

![ГД: 216 Округ](/images/charts/ru/federal-216-tik-2.jpg)
![ГД: 216 Округ](/images/charts/ru/federal-216-tik-32.jpg)
![ГД: 216 Округ](/images/charts/ru/federal-216-tik-33.jpg)

</details>

<details>
<summary><b>Графики округа №216 по ТИК (Петроградский и Адмиралтейский район)</b></summary>

![ГД: 216 Округ](/images/charts/ru/federal-216-tik-18.jpg)
![ГД: 216 Округ](/images/charts/ru/federal-216-tik-54.jpg)
![ГД: 216 Округ](/images/charts/ru/federal-216-tik-1.jpg)
![ГД: 216 Округ](/images/charts/ru/federal-216-tik-31.jpg)

</details>

<details>
<summary><b>Графики округа №217 по ТИК (Фрунзенский район)</b></summary>

![ГД: 217 Округ](/images/charts/ru/federal-217-tik-23.jpg)
![ГД: 217 Округ](/images/charts/ru/federal-217-tik-29.jpg)
![ГД: 217 Округ](/images/charts/ru/federal-217-tik-60.jpg)
![ГД: 217 Округ](/images/charts/ru/federal-217-tik-61.jpg)
![ГД: 217 Округ](/images/charts/ru/federal-217-tik-62.jpg)
![ГД: 217 Округ](/images/charts/ru/federal-217-tik-63.jpg)

</details>

<details>
<summary><b>Графики округа №217 по ТИК (Колпинский район)</b></summary>

![ГД: 217 Округ](/images/charts/ru/federal-217-tik-21.jpg)
![ГД: 217 Округ](/images/charts/ru/federal-217-tik-43.jpg)

</details>

<details>
<summary><b>Графики округа №218 по ТИК (Московский район)</b></summary>

![ГД: 218 Округ](/images/charts/ru/federal-218-tik-19.jpg)
![ГД: 218 Округ](/images/charts/ru/federal-218-tik-27.jpg)
![ГД: 218 Округ](/images/charts/ru/federal-218-tik-48.jpg)

</details>

<details>
<summary><b>Графики округа №218 по ТИК (Кировский район)</b></summary>

![ГД: 218 Округ](/images/charts/ru/federal-218-tik-3.jpg)
![ГД: 218 Округ](/images/charts/ru/federal-218-tik-7.jpg)
![ГД: 218 Округ](/images/charts/ru/federal-218-tik-41.jpg)

</details>


<details>
<summary><b>Графики округа №218 по ТИК (Пушкинский район)</b></summary>

![ГД: 218 Округ](/images/charts/ru/federal-218-tik-20.jpg)
![ГД: 218 Округ](/images/charts/ru/federal-218-tik-59.jpg)

</details>

</details>

***

**Все графики можете найти в [соответствующей папке](/images/charts/ru) или сгенерировать самостоятельно в [боте в Telegram](https://t.me/spbik_bot).**