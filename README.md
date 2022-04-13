# 2021 Elections in Saint Petersburg, Russia 

## **[🇷🇺 Переключиться на русский](/README.ru.md)**

### [📈 Jump to charts](#user-content-results-and-charts)<br/>[🤖 Telegram bot](https://t.me/spbik_bot)

![war criminal helpers](/images/fascist-crap.jpg)

In Russia, Saint Petersburg from 17th to 19th September 2021 several "elections" have been held, results most of which were successfully faked:

* To [7th Legislative Assembly of Saint Petersburg](https://ru.wikipedia.org/wiki/%D0%97%D0%B0%D0%BA%D0%BE%D0%BD%D0%BE%D0%B4%D0%B0%D1%82%D0%B5%D0%BB%D1%8C%D0%BD%D0%BE%D0%B5_%D1%81%D0%BE%D0%B1%D1%80%D0%B0%D0%BD%D0%B8%D0%B5_%D0%A1%D0%B0%D0%BD%D0%BA%D1%82-%D0%9F%D0%B5%D1%82%D0%B5%D1%80%D0%B1%D1%83%D1%80%D0%B3%D0%B0#%D0%9F%D0%BE%D0%BB%D0%BD%D0%BE%D0%BC%D0%BE%D1%87%D0%B8%D1%8F)
* To [8th State Duma](http://en.wikipedia.org/wiki/8th_State_Duma)
* To [Avtovo Municipal District](http://moavtovo.ru/): 4 multi-mandate districts in 19 local election commissions of TEC #41
* To [Lanskoe Municipal District](http://xn--80akoclht.xn--p1ai/): multi-mandate district №9 in LEC 1798, 1801, 1800, 1806, 1809 (they are related to TEC #9).

This repository provides all relevant electoral data: result protocols, commission addresses, members, their automatically-detected sibling guesses among all commissions' members, and reports from [«Golos» elections fraud map](https://www.kartanarusheniy.org/2021-09-19/list).

## Repository contents

* **For developers and researchers:** all results, turnout protocols, commission addresses and their members in JSON format, which can be used for analytical and educational projects. In member files there are also siblings guesses among all other commissions' members, which may be potentially used for investigations.
* **As an example, what could be done using them:** [@spbik_bot](https://t.me/spbik_bot) source code, which allows quick commission data lookups and chart generation, which highlight the votes growth anomalies and show which commissions received [official gratefulness](/docs/official-gratefulness.pdf), [certificates of honours](/docs/certificate-of-honour.pdf) and [badges «For active work in the elections»](/docs/badges.pdf).
* **For those who want to learn about elections in Russia:** this README also provides general information about elections in Russia, how exactly specific results are forged, and charts to investigate (with descriptions for some of them).

If you want to quickly find all information about specific commission or electoral district, just send its number to the [bot](https://t.me/spbik_bot).

**Note:** only publicly available data is used in this repository. You can double check it on [izbirkom.ru](https://izbirkom.ru) and [vestnik.spbik.spb.ru](https://vestnik.spbik.spb.ru/) for validness.

## Project purposes

* **For researchers and investigators** — provide a useful 2021 Saint Petersburg election JSON dataset, which can be converted to any other format. Commission members and their potential sibling connections may be cross-referenced with other data sets, and result protocols may suggest to which commissions to look. As of the moment of writing this text, there are not much details on how exactly election fraud is coordinated and what benefits commission members that commit crimes get.
* **For developers and designers** — make it easier to create data visualisations and to find new ways to explain all election fraud types for bigger audiences. Or, maybe, to inspire to make good algorithms for election fraud detection.
* **For everyone** — remind and record that elections in Saint Petersburg were openly stolen, and you can see that just by studying result protocols and connecting anomalies with observer reports and court cases.

## License

For [bot's source code](/main.js) [GNU LGPLv3](/LICENCE) is used, however:

* [JSON files](/data) could be used without any conditions. If you find them useful in any work or research you could just kindly put a link to this repository or support the creator (using any of the ways below).
* Instead of copying all files, it's better to link this project as [git submodule](https://git-scm.com/book/en/v2/Git-Tools-Submodules). This way you'll automatically have a link to this repository and used commit automatically and won't have a need to store clones of thousands of files.
* In case you want to add a bot feature, new chart type, fix a bug, etc you may submit a Pull Request.
* If you want to use this bot with changes (e.g. try to use for other regions and elections), you can fork it using GitHub, and just specify the list of changes in README.

## Thanks

Thanks to all Russian voters, who didn't ignore the elections. Without their attendance, commission members wouldn't need to commit crimes, and there would be no traces of the real situation in protocols, as administrative resources misuse and propaganda would be enough for needed candidates.

Special thanks for those who fought for the rule of law and tried to prevent the election fraud: observers, independent election commission members, and others.

In response to candidate registration denials and arrests, Navalny's team came up with [Smart Vote](https://votesmart.appspot.com/) strategy: voting for just one strongest opponent to the kremlin's one. In some charts it's possible to see in the charts, why Roskomnadzor tried to limit access to their recommendations as much as they could, using [illegal censorship](https://habr.com/post/598265/) и [FSB pressure on Google's employees](https://www.washingtonpost.com/world/2022/03/12/russia-putin-google-apple-navalny/).

It's not possible to know whether over 60% voters who abstained really exist or not, however, if they do, there's a chance if all of them just supported [Smart Vote](https://votesmart.appspot.com/) strategy, winners in some electoral districts could be different.

And final thanks to TEC #9 (Lanskoe Municipality District), which descendant commissions used all types of fraud, and there are almost no protocols without fraud, thanks to which United Russia got the best result in that TEC. Without its crimes insolence, this project wouldn't exist.

## Support project creator

This project was created just out of author's curiosity to find out few things:

1. Real support of different candidates and parties in Saint Petersburg
2. Who would win if there would be no insolent fraud
3. How many people supported [smart vote](https://votesmart.appspot.com) candidates, despite how its recommendations were censored by [Roskomnadzor](https://habr.com/post/598265/) and [FSB](https://www.washingtonpost.com/world/2022/03/12/russia-putin-google-apple-navalny/).

Unfortunately, nobody neither supported nor funded this project at any step of its creation. If you personally liked it, found any use of it, or would like to see more electoral projects (many ideas, but no time), you may donate using crypto or PayPal:

**BTC**: `bc1qgfxx7hpwslxf7p3vvrmze8mxm5z3l26zx2mt6r`  
**ETH**: `0x9373E9DB2E18A1CFc7d370ecd2cc607b63ad697b`  
**[TON](https://ton.org)**: `EQDIChbAdWuLMNQhkDqhLVNP2O2kWTGpEIVbl7DqMvvk0RZF`  
**PayPal**: [paypal.me/notamouranth](https://paypal.me/notamouranth)

# Results and charts

If you are not familiar with how election process looks like from voters perspective, and would like to briefly understand the process:

<details>
<summary><b>Election process and commissions</b></summary>

Local election commissions (LEC) are places, where people go to vote to put a ballot in a ballot box (which they get there too). Each voter is attached to specific LEC based on their registration address. To know where to go to vote, there's a special [digital service](http://cikrf.ru/digital-services/naydi-svoy-izbiratelnyy-uchastok/). LECs are usually located in schools, preschool, universities, dormitories, hospitals and neuropsychiatries.

On the vote day, voter goes to LEC, where commission members sit at the tables with ballot papers and voters registry. Each commission member handles specific address range and works with the corresponding voters registry. Once voters approaches them, commission member finds the voter in the list. If voter is not found there, registration address in passport is checked (this happens frequently), and, if it falls into the address range, new voter entry line is being added.

Next, put a check in obtained ballot papers, and simply throw it in a single stationary ballot box.

On some elections (like State Duma elections) it's possible to vote abroad in embassies and consulates. It's possible to go there without any prior registration. There were 6 local election commissions attached to Saint Petersburg electoral districts:

1. 🇩🇪 **LEC 8317** — consulate general in Leipzig, Germany — attached to 217 State Duma district
2. 🇩🇪 **LEC 8413** — consulate general in Bonn, Germany — attached to 211 State Duma district
3. 🇩🇪 **LEC 8429** — same — 213 State Duma district
4. 🇩🇪 **LEC 8425** — same — 214 State Duma district
5. 🇩🇪 **LEC 8418** — same — 216 State Duma district
6. 🇧🇬 **LEC 8050** — embassy in Sofia, Bulgary — attached to 217 State Duma district

On these elections voters received from 1 up to 5 ballot papers:

* When voter goes to LEC in Russia based on the registration address (most common case), they receive 4 ballot papers, 5 — if there were municipality elections.
* When voter detaches from their default LEC and attaches to the nearest one (there's a special procedure for that available before voting starts), if registration address is from other State Duma electoral district, voter would get only 1 ballot paper — State Duma (parties).
* If voter has attached to the specific commission and registration address is within the same State Duma electoral district as the commission voter has attached to, voter could get the second ballot paper — for the specific.
* It is possible to participate in Legislative Assembly voting only in the default LEC. Therefore when you see a commission in which number of Legislative Assembly voters is significantly higher than State Duma, it's most likely the result of fraud protocol.
* In abroad commissions, voters could vote only for State Duma parties. Combination of specific LEC's attached electoral district and voter's registration in Russia they could get the person vote paper too, however, in practice most of the commissions rejected to provide one.

***

</details>

The most detailed about fraud specifics in Saint Petersburg are collected in [Saint Petersburg Observers Report](/docs/spb-elections-review-2021.pdf). If you want to have a brief introduction to the fraud process:

<details>
<summary><b>Fraud methods and their traces in voting protocols</b></summary>

Election fraud methods are usually determined and coordinated by the territorial election commissions. Below the most common methods are described.

### 0. Registration denials and pre-vote preparations

It is important to understand that the list of candidates and parties is filtered, which plays a major part in getting the needed result. You may slightly read about pre-vote preparations in the [Golos report](https://www.golosinfo.org/articles/145498). But despite that because the real support of the needed candidates is so little, election fraud methods below are still used.

### 1. Ballot stuffing.

The most common way to increase amount of votes for the needed candidate is to use much more ballot papers than one person is legally allowed to.

However, it's more complex than just finding a pack of ballot papers and putting it in the ballot box. If you do so without prior arrangement with the commission members, they would simply have to cancel the voting results, as ballot papers number would exceed the number they officially provided according to the voters registry.

Therefore, to make the fraud successful, you need to have a prior arrangement with at least one election commission member, who would illegally edit the voters registry to match the amount of provided ballot papers.

There are several methods to find the ballot stuffing in the result protocols. It's possible by comparison with the closest commissions results, as stuffing usually increases amount of votes for just 1 candidate or party, without affecting the result of the rest, using statistical analysis, e.g. [Shpilkin's method](https://ru.wikipedia.org/wiki/Шпилькин,_Сергей_Александрович#Методика_статистического_анализа_результатов_выборов)

There's an alternative method though: by comparing different protocols of the same commission. Sometimes you may notice that number of people who participated in Legislative Assembly elections is significantly higher than the same number for State Duma elections. This is possible only if someone has put extra Legislative Assembly ballot papers in the box and forgot to do so for the State Duma.

### 2. Ballot safe-package replacements.

On September elections it was the first time when voters could come and vote for three days. In the end of the first (17.09) and the second (18.09) day, all papers from the stationary ballot box were packed in the special safe-packages.

The exact process of storing was designed to provide an ability for commission members to just replace the package contents during the night, which many commissions did.

**How to detect:** by turnout protocols and lowered number of votes for all candidates, except one. Any abnormal amount of voters on the first and the second day is the trace of the fraud activity, as in fact most of the voters came on the last day (19.09), then on the first day (17.09) and only then on the second (18.09). Meanwhile, 19.09 was the only date promoted in vote advertisements. When entire safe package contents of just one day gets replaced with votes for just one candidate, it reduces the amount of votes against that candidate, but preserves proportion between other candidates. 

### 3. Handwritten results and fraud during count procedure.

Probably the dirtiest way to fake the election result in the given LEC. This way, the ballot papers amount and contents get completely ignored, and fake results get written in the final protocol.

Possible to see on result bars charts: handwritten protocols are usually the ones with abnormal result pattern that doesn't match the other ones.

### 4. Result override in the head TEC

Same as the previous fraud type, except that LEC may announce the proper result (sometimes even without any fraud), however, arbitrary result gets entered to the higher-level TEC protocol and electronic.

It's not possible to differ this method from the previous one without looking into violation reports.

### 5. [Carousel voting](https://en.wikipedia.org/wiki/Carousel_voting)

This method involves a group or several groups of people that drive through multiple election commissions and vote there without having the legal right to (registration address).

This usually arranged with TEC which arranges that LEC have a special commission member which does.

When such "carousel" members vote one by one, there's no way to trace them in the final protocols, as there's no way to differ them from the real voters. A group of 20 people could provide needed parties and candidates up to 400 votes within LECs of one TEC that has 20 local commissions.

***

</details>

## Legislative Assembly of Saint Petersburg

[Legislative Assembly](https://ru.wikipedia.org/wiki/Законодательное_собрание_Санкт-Петербурга) has a [lot of powers](https://ru.wikipedia.org/wiki/Законодательное_собрание_Санкт-Петербурга#Полномочия): from adopting city laws and controlling the budget up to assigning [Magistrates' court](https://en.wikipedia.org/wiki/Magistrates%27_court_(Russia)) and [Statutory Court](https://ru.wikipedia.org/wiki/Уставный_суд_Санкт-Петербурга).

The special power of Legislative Assembly is to assign members of the head Saint Petersburg election commission, **which organises the elections to Legislative Assembly**.

This power excludes an option to have just elections in Saint Petersburg, as by having needed members it's able to ignore all election violation reports.

Below are charts that show how Legislative Assembly members have elected and descriptions of some of them. In case you couldn't find the one you were looking for, you can send election commission or district number to the [bot](https://t.me/spbik_bot).

In case you would like to learn more about Legisltive Assembly deputies, you may read this [Zaks.ru article](https://www.zaks.ru/new/archive/view/218253).

### Relationship with Legislative Assembly with [Federation Council](https://en.wikipedia.org/wiki/Federation_Council_(Russia))

On federal level Legislative Assembly of Saint Petersburg is important, because it assigns one Federation Council member. One of the last and most important documents of Federation Council orders is, for example, the document from `22.02.2022` [that allows use of russian army abroad in the undetermined location for the undetermined period](/docs/council-22.0.2022.pdf) which was supported by all members.

Legislative Assembly of Saint Petersburg assigned **[Andrey Kutepov](https://www.zaks.ru/new/person/view/5035)** there that declares that all sanctions against Russia [do only good for russian people](https://t.me/zaksru/3777).

There are 200 Federation Council members: 30 are assigned directly by president (Vladimir Putin) and two per 85 Russian regions (one – from legislative power, one — from executive power).

The second Federation Council member is [Valentina Matvienko](https://www.youtube.com/watch?v=p2gNZrfmcVU), at the same time she is the head of it. Formally she is assigned by city governor [Beglov](https://en.wikipedia.org/wiki/Alexander_Beglov), "elected" the same Saint Petersburg election commission in 2019.

***

**Note:** below is just a review of few electoral districts. It's possible to write a huge essay for each electoral district with detailed description on why specific candidate was assigned by the election fraud. If you want to improve this section, you can submit a pull request.

***

![LA: District #21](/images/charts/en/city-21.jpg)

The main candidate in district #21 was [**Maxim Reznik**](https://ru.wikipedia.org/wiki/%D0%A0%D0%B5%D0%B7%D0%BD%D0%B8%D0%BA,_%D0%9C%D0%B0%D0%BA%D1%81%D0%B8%D0%BC_%D0%9B%D1%8C%D0%B2%D0%BE%D0%B2%D0%B8%D1%87), 6-th Legislative Assembly deputy: [YouTube channel](https://www.youtube.com/user/maximreznik), [Telegram](https://t.me/maximreznik), [campaign video](https://www.youtube.com/watch?v=w1X9W_eTz8w), [campaign website](http://maximreznik.ru/).

By using [fabricated](https://www.severreal.org/a/31163212.html) criminal case, Maxim was detained [the next day Legislative Assembly elections were announced](https://www.zaks.ru/new/archive/view/214173) and put under house arrest. Local prosecutor [illegally prohibited a meeting with notary](https://www.fontanka.ru/2021/07/08/70015028/), which made his further registration as a candidate impossible.

Different popular candidate **Olga Galkina** ([5-th LA Assembly deupty](http://www.assembly.spb.ru/authors/show/635516516)) has successfully registered in this district and supported by Smart Vote strategy. When the voting was finished on 19th September at 20:00, members and heads of some local election commission ran away without announcing the result. 14 hours later TECs [announced the fake results in that commissions](https://www.zaks.ru/new/archive/view/217929).

On the chart above you may clearly see how such protocols managed to get Andrey Malkov **from the last to the first place**.

Andrey Malkov participated in the [monitoring](https://vk.com/wall497455_5161) of the status of [Saint Petersburg Sports and Concert Complex](https://en.wikipedia.org/wiki/Saint_Petersburg_Sports_and_Concert_Complex) (it is located in the #21 electoral district area) and active promotion of the ["SKA Arena" project](https://vk.com/wall-16672464_12953) after the soviet stadium was demolished. Vladimir Putin friends — Gennady Timchenko and Roman Rotenberg — are dreaming about the biggest ice skating area [since 2018](https://sportrbc.ru/news/614b3a249a7947761e023a29).

***

![LA. District #3](/images/charts/en/city-3.jpg)

In district #3 Irina Fatyanova did the most noticeable campaign in the city, during which she successfully got over 4 thousands signatures in support of her registration. You may read more about her campaign in [this Economist article](https://www.economist.com/interactive/repression-in-putins-russia/).

TEC #18, responsible for candidate registration, illegally canceled her candidate status [following the procedure that does not exist in the law at all](https://paperpaper.ru/vidimo-poyavilsya-strah-chto-soberu-pod/), and later the head Saint Petersburg election commission [confirmed this decision](https://t.me/fatyanovawithlove/667).

After receiving this denial, she asked her supporters to come anyway and vote according to the [Smart Vote strategy](https://t.me/fatyanovawithlove/685) and called to become election observers.

Another candidate that was not able to participate was Ksenia Mihaylova. She was not allowed to participate because of [absurd city court decision](https://www.yabloko.ru/regnews/Spb/2021/09/07).

In district #3 all kinds of fraud were used, as well as administrative resources misuse, which was used to detain independent election observers. This way they faked the win of the [Vyacheslav Makarov](https://en.wikipedia.org/wiki/Vyacheslav_Makarov)'s daughter — Marina Makarova (changed the last name to "Lybaneva" during the election).

Above on the chart from the left to LEC 1652 — the most trustworthy protocols available. Right to them until LEC 1807, you may notice that the growth dynamics increases only for Marina — that's the result of simple ballot stuffing. After that commission are the commissions with the safe package replacements and hand-written results (amount of votes for Marina increases, for all other candidates combined — proportionally decreases). Black line is the sum of votes against Marina Lybaneva.

*** 

![LA. District #2](/images/charts/en/city-2.jpg)

In district #2 the main candidate was [Boris Lazarevich Vishnevsky](https://ru.wikipedia.org/wiki/Вишневский,_Борис_Лазаревич), city deputy since 2011: [website](http://visboris.ru), [Telegram channel](https://t.me/visboris).

During ballot there were several Boris' ["clones" registered](https://meduza.io/news/2021/09/06/dvoyniki-borisa-vishnevskogo-zayavivshiesya-na-vybory-v-peterburge-podali-v-izbirkom-fotografii-kak-u-originala) — candidate who changed their names to "Boris Vishnevsky" just for these elections.

If you watch only for the final result, you may think that he missed just couple hundred votes in addition to those who mistakenly voted for his clones. In reality, Boris Vishnevsky's win was stolen by overridden protocols and carousel voting in support of Rzhanenkov.

He anyway remained the LA deputy, thanks to votes for Yabloko party, but if his win in district #2 wouldn't be stolen, there would be one more Yabloko party deputy in Legislative Assembly.

Boris also participated in State Duma elections in district #216, in which his win was stolen too. You can find charts for the State Duma elections in the folder.

***

![LA. District #6](/images/charts/en/city-6.jpg)

[Mihail Amosov](https://ru.wikipedia.org/wiki/Амосов,_Михаил_Иванович) — one of three candidates on [city governor elections in 2019](https://en.wikipedia.org/wiki/2019_Saint_Petersburg_gubernatorial_election) — won in district #6.

His win was not stolen, but you may notice that the gap from the United Russia candidate was significantly reduced by the fraud. Most likely it was used to hide real difference between their support. Just one LEC 509 formally got 1,743 votes for Dmitry Vasiliev.

<details>
<summary><b>Fake turnout and result in LEC #573</b></summary>

![LA. District #6. LEC 509](/images/charts/en/city-6-uik-509.png)

</details>

***

![LA. District #7](/images/charts/en/city-7.jpg)

Nadezhda Tikhonova — the third candidate on [2019 governor elections](https://en.wikipedia.org/wiki/2019_Saint_Petersburg_gubernatorial_election) — participated in LA district #7 and State Duma district #212, both of which were stolen from her, thanks to different [election fraud](https://vk.com/wall-29887880_9510) methods used in the corresponding commissions.

The most absurd protocols are from LEC 573, where, formally, there was 100% turnout (1,922 people), 1,289 from which got to vote on the first day (17.09), and only 69 — on the last (19.09).

<details>
<summary><b>Fake turnout and result in LEC #573</b></summary>

![LA. District #7. LEC #573](/images/charts/en/city-7-uik-573.png)

</details>

***

![LA. District #24](/images/charts/en/city-24.jpg)

One of the electoral districts that highlight that United Russia candidates are not the only holders of fake wins.

***

<details>
<summary><b>Other Legislative Assembly electoral districts</b></summary>

![LA. District #1](/images/charts/en/city-1.jpg)
![LA. District #4](/images/charts/en/city-4.jpg)
![LA. District #5](/images/charts/en/city-5.jpg)
![LA. District #8](/images/charts/en/city-8.jpg)
![LA. District #9](/images/charts/en/city-9.jpg)
![LA. District #10](/images/charts/en/city-10.jpg)
![LA. District #11](/images/charts/en/city-11.jpg)
![LA. District #12](/images/charts/en/city-12.jpg)
![LA. District #13](/images/charts/en/city-13.jpg)
![LA. District #14](/images/charts/en/city-14.jpg)
![LA. District #15](/images/charts/en/city-15.jpg)
![LA. District #16](/images/charts/en/city-16.jpg)
![LA. District #17](/images/charts/en/city-17.jpg)
![LA. District #18](/images/charts/en/city-18.jpg)
![LA. District #19](/images/charts/en/city-19.jpg)
![LA. District #20](/images/charts/en/city-20.jpg)
![LA. District #22](/images/charts/en/city-22.jpg)
![LA. District #23](/images/charts/en/city-23.jpg)
![LA. District #25](/images/charts/en/city-25.jpg)

</details>

<details>
<summary><b>Interesting findings in party voting (Legislative Assembly)</b></summary>

Despite the fact that the chart do not make it clear how many mandates approximately each party would get if there would be no election fraud, you may still clearly see the facts of the fraud, and sometimes not in favor of United Russia.

![TEC 54](/images/charts/en/city-parties-tik-54.jpg)

![TEC 18](/images/charts/en/city-parties-tik-18.jpg)

![TEC 9](/images/charts/en/city-parties-tik-9.jpg)

![TEC 19](/images/charts/en/city-parties-tik-19.jpg)

![TEC 22](/images/charts/en/city-parties-tik-22.jpg)

![TEC 34](/images/charts/en/city-parties-tik-34.jpg)

![TEC 35](/images/charts/en/city-parties-tik-35.jpg)

![TEC 36](/images/charts/en/city-parties-tik-36.jpg)

![TEC 10](/images/charts/en/city-parties-tik-10.jpg)

![TEC 22](/images/charts/en/city-parties-tik-20.jpg)

![ТИК 22](/images/charts/en/city-parties-tik-62.jpg)

Charts for all other territorial election commissions (TEC) can be found in the [corresponding folder](/images/charts/en).

</details>

<details>
<summary><b>Mistakes during the election fraud</b></summary>

4 of 5 commissions which were involved in Lanskoe Municipality elections have drawn nonexistent significant support of United Russia candidates. But you may notice that in LEC 1806 one of these 5 candidates didn't receive any votes, and CPRF candidate got it instead.

![Lanskoe Municipality](/images/charts/en/municipality-Ланское-2.jpg)

How did it happen? Answer is simple — CPRF candidate is just one line above the United Russia candidate, which won thanks to the dramatic fraud in other commissions. Most likely, whoever was entering the false data, made a mistake and put 488 votes to the wrong guy.

![Lanskoe Municipality: table](/images/charts/ru/municipality-Ланское-2-table.jpg)

***

On the next chart you may notice that LEC 1794 and 1798 CPRF's result was swapped with "Communists of Russia"'s result (red and brown bars).

![TEC 9: State Duma parties](/images/charts/en/federal-parties-tik-9-bars.jpg)

In different charts, in which you can clearly differ the close-to-reality protocols and protocols with stuffing for the specific candidate / party, you may sometimes notice one or couple commissions that have abnormal number of "invalid" or "taken home" ballot papers. Usually that's a trace of prepared pack of ballot papers for stuffing, but which commission members were not able to put in a stationary box (i.e. because of the election process observers activity).

</details>

<details>
<summary><b>State Duma electoral districts</b></summary>

<details>
<summary><b>Overall picture (for detailed review, refer to TEC charts)</b></summary>

![State Duma: District #211](/images/charts/en/federal-211.jpg)
![State Duma: District #212](/images/charts/en/federal-212.jpg)
![State Duma: District #213](/images/charts/en/federal-213.jpg)
![State Duma: District #214](/images/charts/en/federal-214.jpg)
![State Duma: District #215](/images/charts/en/federal-215.jpg)
![State Duma: District #216](/images/charts/en/federal-216.jpg)
![State Duma: District #217](/images/charts/en/federal-217.jpg)
![State Duma: District #218](/images/charts/en/federal-218.jpg)

</details>

<details>
<summary><b>District #211 by TEC (<a href="https://en.wikipedia.org/wiki/Tsentralny_District,_Saint_Petersburg">Tsentralny district</a>))</b></summary>

![State Duma: District #211](/images/charts/en/federal-211-tik-30.jpg)
![State Duma: District #211](/images/charts/en/federal-211-tik-64.jpg)

</details>

<details>
<summary><b>District #211 by TEC (<a href="https://en.wikipedia.org/wiki/Nevsky_District">Nevsky district</a>)</b></summary>

![State Duma: District #211](/images/charts/en/federal-211-tik-5.jpg)
![State Duma: District #211](/images/charts/en/federal-211-tik-24.jpg)
![State Duma: District #211](/images/charts/en/federal-211-tik-49.jpg)
![State Duma: District #211](/images/charts/en/federal-211-tik-50.jpg)
![State Duma: District #211](/images/charts/en/federal-211-tik-51.jpg)
![State Duma: District #211](/images/charts/en/federal-211-tik-52.jpg)
![State Duma: District #211](/images/charts/en/federal-211-tik-53.jpg)

</details>

<details>
<summary><b>District #212 by TEC (<a href="https://en.wikipedia.org/wiki/Kirovsky_District,_Saint_Petersburg">Kirovsky district</a>)</b></summary>

![State Duma: District #212](/images/charts/en/federal-212-tik-7.jpg)
![State Duma: District #212](/images/charts/en/federal-212-tik-42.jpg)

</details>

<details>
<summary><b>District #212 by TEC (<a href="https://en.wikipedia.org/wiki/Krasnoselsky_District,_Saint_Petersburg">Krasnoselsky district</a>)</b></summary>

![State Duma: District #212](/images/charts/en/federal-212-tik-6.jpg)
![State Duma: District #212](/images/charts/en/federal-212-tik-26.jpg)
![State Duma: District #212](/images/charts/en/federal-212-tik-46.jpg)
![State Duma: District #212](/images/charts/en/federal-212-tik-47.jpg)


</details>

<details>
<summary><b>District #212 by TEC (<a href="https://en.wikipedia.org/wiki/Petrodvortsovy_District">Petrodvortsovy district</a>)</b></summary>

![State Duma: District #212](/images/charts/en/federal-212-tik-8.jpg)
![State Duma: District #212](/images/charts/en/federal-212-tik-55.jpg)

</details>

<details>
<summary><b>District #213 by TEC (<a href="https://en.wikipedia.org/wiki/Kalininsky_District,_Saint_Petersburg">Kalininsky district</a>)</b></summary>

![State Duma: District #213](/images/charts/en/federal-213-tik-17.jpg)
![State Duma: District #213](/images/charts/en/federal-213-tik-37.jpg)
![State Duma: District #213](/images/charts/en/federal-213-tik-39.jpg)

</details>

<details>
<summary><b>District #213 by TEC (<a href="https://en.wikipedia.org/wiki/Vyborgsky_District,_Saint_Petersburg">Vyborgsky district</a>)</b></summary>

![State Duma: District #213](/images/charts/en/federal-213-tik-10.jpg)
![State Duma: District #213](/images/charts/en/federal-213-tik-14.jpg)
![State Duma: District #213](/images/charts/en/federal-213-tik-22.jpg)
![State Duma: District #213](/images/charts/en/federal-213-tik-34.jpg)
![State Duma: District #213](/images/charts/en/federal-213-tik-35.jpg)
![State Duma: District #213](/images/charts/en/federal-213-tik-36.jpg)

</details>

<details>
<summary><b>District #214 by TEC (<a href="https://en.wikipedia.org/wiki/Kalininsky_District,_Saint_Petersburg">Kalininsky district</a>)</b></summary>

![State Duma: District #214](/images/charts/en/federal-214-tik-11.jpg)
![State Duma: District #214](/images/charts/en/federal-214-tik-38.jpg)
![State Duma: District #214](/images/charts/en/federal-214-tik-40.jpg)

</details>

<details>
<summary><b>District #214 by TEC (<a href="https://en.wikipedia.org/wiki/Krasnogvardeysky_District,_Saint_Petersburg">Krasnogvardeysky district</a>)</b></summary>

![State Duma: District #214](/images/charts/en/federal-214-tik-4.jpg)
![State Duma: District #214](/images/charts/en/federal-214-tik-25.jpg)
![State Duma: District #214](/images/charts/en/federal-214-tik-44.jpg)
![State Duma: District #214](/images/charts/en/federal-214-tik-45.jpg)

</details>

<details>
<summary><b>District #215 by TEC (<a href="https://en.wikipedia.org/wiki/Primorsky_District,_Saint_Petersburg">Primorsky district</a>)</b></summary>

![State Duma: District #215](/images/charts/en/federal-215-tik-9.jpg)
![State Duma: District #215](/images/charts/en/federal-215-tik-12.jpg)
![State Duma: District #215](/images/charts/en/federal-215-tik-28.jpg)
![State Duma: District #215](/images/charts/en/federal-215-tik-56.jpg)
![State Duma: District #215](/images/charts/en/federal-215-tik-57.jpg)
![State Duma: District #215](/images/charts/en/federal-215-tik-58.jpg)

</details>

<details>
<summary><b>District #215 by TEC (<a href="https://en.wikipedia.org/wiki/Kurortny_District">Kurortny</a> and <a href="https://en.wikipedia.org/wiki/Kronstadt">Kronshtadtsky</a> districts)</b></summary>

![State Duma: District #215](/images/charts/en/federal-215-tik-13.jpg)
![State Duma: District #215](/images/charts/en/federal-215-tik-15.jpg)

</details>

<details>
<summary><b>District #216 by TEC (<a href="https://en.wikipedia.org/wiki/Tsentralny_District,_Saint_Petersburg">Tsentralny district</a>)</b></summary>

![State Duma: District #216](/images/charts/en/federal-216-tik-16.jpg)
![State Duma: District #216](/images/charts/en/federal-216-tik-64.jpg)

</details>

<details>
<summary><b>District #216 by TEC (<a href="https://en.wikipedia.org/wiki/Vasileostrovsky_District">Vasileostrovsky district</a>)</b></summary>

![State Duma: District #216](/images/charts/en/federal-216-tik-2.jpg)
![State Duma: District #216](/images/charts/en/federal-216-tik-32.jpg)
![State Duma: District #216](/images/charts/en/federal-216-tik-33.jpg)

</details>

<details>
<summary><b>District #216 by TEC (<a href="https://en.wikipedia.org/wiki/Petrogradsky_District">Petrogradsky</a> и <a href="https://en.wikipedia.org/wiki/Admiralteysky_District">Admiralteysky</a> districts)</b></summary>

![State Duma: District #216](/images/charts/en/federal-216-tik-18.jpg)
![State Duma: District #216](/images/charts/en/federal-216-tik-54.jpg)
![State Duma: District #216](/images/charts/en/federal-216-tik-1.jpg)
![State Duma: District #216](/images/charts/en/federal-216-tik-31.jpg)

</details>

<details>
<summary><b>District #217 by TEC (<a href="https://en.wikipedia.org/wiki/Frunzensky_District,_Saint_Petersburg">Frunzensky district</a>)</b></summary>

![State Duma: District #217](/images/charts/en/federal-217-tik-23.jpg)
![State Duma: District #217](/images/charts/en/federal-217-tik-29.jpg)
![State Duma: District #217](/images/charts/en/federal-217-tik-60.jpg)
![State Duma: District #217](/images/charts/en/federal-217-tik-61.jpg)
![State Duma: District #217](/images/charts/en/federal-217-tik-62.jpg)
![State Duma: District #217](/images/charts/en/federal-217-tik-63.jpg)

</details>

<details>
<summary><b>District #217 by TEC (<a href="https://en.wikipedia.org/wiki/Kolpinsky_District">Kolpinsky district</a>)</b></summary>

![State Duma: District #217](/images/charts/en/federal-217-tik-21.jpg)
![State Duma: District #217](/images/charts/en/federal-217-tik-43.jpg)

</details>

<details>
<summary><b>District #218 by TEC (<a href="https://en.wikipedia.org/wiki/Moskovsky_District,_Saint_Petersburg">Moskovsky district</a>)</b></summary>

![State Duma: District #218](/images/charts/en/federal-218-tik-19.jpg)
![State Duma: District #218](/images/charts/en/federal-218-tik-27.jpg)
![State Duma: District #218](/images/charts/en/federal-218-tik-48.jpg)

</details>

<details>
<summary><b>District #218 by TEC (<a href="https://en.wikipedia.org/wiki/Kirovsky_District,_Saint_Petersburg">Kirovsky district</a>)</b></summary>

![State Duma: District #218](/images/charts/en/federal-218-tik-3.jpg)
![State Duma: District #218](/images/charts/en/federal-218-tik-7.jpg)
![State Duma: District #218](/images/charts/en/federal-218-tik-41.jpg)

</details>


<details>
<summary><b>District #218 by TEC (<a href="https://en.wikipedia.org/wiki/Pushkinsky_District,_Saint_Petersburg">Pushkinsky district</a>)</b></summary>

![State Duma: District #218](/images/charts/en/federal-218-tik-20.jpg)
![State Duma: District #218](/images/charts/en/federal-218-tik-59.jpg)

</details>

</details>

***

**All charts charts can be found in the [corresponding folder](/images/charts/en) or generated manually using [@spbik_bot](https://t.me/spbik_bot).**