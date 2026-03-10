/**
 * Header news feed: shows a new item every 3 simulation ticks based on lift wait, slope crowds and slope quality.
 */

import { state } from './state';

const NEWS_TICK_INTERVAL = 3;
const SKIER_FRAMES = 5;
/** Experience 0–100: above this = positive news, else negative. */
const POSITIVE_THRESHOLD = 50;

const NEWS_LIFT_POSITIVE = [
  "Sploh se ne splača usesti, ker si že na vrsti. Ekspresno!",
  "Hitreje sem na vrhu kot pa moji pancarji na nogah. Svetlobna hitrost!",
  "Nobene vrste? Danes bom naredil več kilometrov kot moj avto na poti sem!",
  "Žičničarji danes delajo kot švicarska ura. Kapo dol!",
  "Tole je pa luksuz, direktno iz smuči na sedežnico brez čakanja.",
  "Končno smučišče, kjer ne zapravim pol dneva v vrsti.",
  "Vau, še preden sem odpel rokavice, sem bil že na vrhu!",
  "To je tisto, kar plačaš – smučanje, ne pa stanje na mestu.",
  "Danes gredo naprave hitreje kot moje noge dopuščajo!",
  "Pravo privatno smučišče. Upam, da nihče ne izve zanj!"
];

const NEWS_LIFT_NEGATIVE = [
  "Več časa sem stal v vrsti kot na smučeh! Katastrofa.",
  "Moja brada je zrasla za dva centimetra, odkar čakamo na ta Girak.",
  "A delijo zastonj golaž na vrhu, da vsi čakajo tukaj?",
  "Uprava, a spite? Vrsta sega že do sosednje vasi!",
  "Še tri pesmi na radiu, pa bomo morda prišli do vstopne rampe.",
  "Tole ni smučišče, to je vaja iz potrpežljivosti v mrazu.",
  "Če bi hotel stati v vrsti, bi šel v banko, ne pa na goro.",
  "Moja kava v termovki se je že ohladila, pa še vedno nismo na vrsti.",
  "Tale Poma se premika kot polž s protivnetno kremo.",
  "Naslednjič prinesem stol in šahovnico za v tole vrsto."
];

const NEWS_CROWD_POSITIVE = [
  "Končno lahko zarežem takšen zavoj, da bi me še Križaj pohvalil. Cela proga je moja!",
  "Mir in tišina... na progi sem sam s svojimi mislimi in snegom. Čisti užitek.",
  "Nobenega slalomiranja med ljudmi! Danes smučam kot kralj na svojem posestvu.",
  "Proga je tako prazna, da bi lahko smučal z zaprtimi očmi.",
  "To je tisto pravo – svoboda na gori brez strahu pred trkom.",
  "Končno prostor za prave hitrostne zavoje brez zaviranja.",
  "Danes je gora samo moja. Raj na zemlji!",
  "Smučati na tako prazni progi je kot plesati v prazni dvorani.",
  "Nobenih začetnikov, ki bi mi sekali pot. Popolno!",
  "Tukaj se človek res lahko sprosti in uživa v hitrosti."
];

const NEWS_CROWD_NEGATIVE = [
  "To ni smučišče, to je avtocesta v konici! Nevarno.",
  "Nekdo me je skoraj povozil! Tukaj se sploh ne da več zavijati.",
  "Danes smučajo vsi, od dojenčkov do prababic. Čisto mravljišče!",
  "Pazi glavo! Ljudje letijo mimo mene kot nevodene rakete.",
  "Tukaj je večja gneča kot v soboto na tržnici.",
  "Smučanje v takšni množici je bolj podobno preživetju kot športu.",
  "Vsakih deset metrov se moram ustaviti, da ne koga ne 'pobremzam'.",
  "Tale proga je postala poligon za trčenja. Odhajam domov!",
  "A so odprli samo eno progo za tisoč ljudi? Katastrofalna gneča.",
  "Še v mestnem avtobusu je več prostora kot na tej strmini."
];

const NEWS_QUALITY_POSITIVE = [
  "Te rebrce so tako popolne, da bi jih najraje fotografiral in uokviril!",
  "Sneg je kot maslo – smuči kar same zavijajo. Čestitke ekipi z ratraki!",
  "Tole je pa puhek prve klase. Še oblaki so ljubosumni na podlago!",
  "Sneg drži kot pribit. Ratraki so opravili vrhunsko delo.",
  "Zjutraj je bilo smučanje po teh rebrcih čista poezija.",
  "Proga je zravnana kot z likalnikom. Užitek v vsakem zavoju!",
  "Tudi popoldne sneg še vedno drži obliko. Odlična podlaga!",
  "Brez ledu, brez grbin, samo čist užitek na snegu.",
  "Kapo dol tistemu, ki je vozil ratrak danes ponoči. Mojster!",
  "Tole je najboljša priprava proge v tej sezoni. Brez debate."
];

const NEWS_QUALITY_NEGATIVE = [
  "Smučam ali drsam? Proga je trda kot beton, kje so ratraki?!",
  "Te grbine mi bodo uničile kolena. Kot bi se vozil po pralnem stroju.",
  "Naredil sem en zavoj in končal v gozdu. Sneg je obupen.",
  "Tukaj bi potreboval drsalke, ne pa smuči. Same ledene ploskve!",
  "Proga izgleda kot bojišče po bombardiranju. Same jame in kupi.",
  "A so ratrake prodali ali so vsi v okvari? Sneg je katastrofalen.",
  "Težko je uživati, ko se boriš z grbinami visokimi kot hiše.",
  "Smuči mi tresejo bolj kot stari pralni stroj pri centrfugi.",
  "Čisti led. Uprava očitno varčuje pri urejanju prog.",
  "Od takšne proge te samo noge bolijo, užitka pa nobenega."
];

const DEFAULT_MESSAGE = 'Prvi spust danes. Bomo videli!';

/** Picks a message and whether it's positive (happy) or negative (angry). */
function pickMessageAndMood() {
  const categories = [
    { value: state.liftExperience, positive: NEWS_LIFT_POSITIVE, negative: NEWS_LIFT_NEGATIVE },
    { value: state.slopeCrowdExperience, positive: NEWS_CROWD_POSITIVE, negative: NEWS_CROWD_NEGATIVE },
    { value: state.slopeQualityExperience, positive: NEWS_QUALITY_POSITIVE, negative: NEWS_QUALITY_NEGATIVE },
  ];
  const category = categories[Math.floor(Math.random() * categories.length)];
  const v = Math.max(0, Math.min(100, category.value));
  const isPositive = v >= POSITIVE_THRESHOLD;
  const list = isPositive ? category.positive : category.negative;
  const message = list[Math.floor(Math.random() * list.length)];
  return { message, isPositive };
}

let newsSpriteUrlsHappy = [];
let newsSpriteUrlsAngry = [];
let lastHappySheetIndex = -1;
let lastHappyFrame = -1;
let lastAngrySheetIndex = -1;
let lastAngryFrame = -1;

function hasNews() {
  return state.lifts.length > 0 && state.resortOpen !== false;
}

export function initNewsFeed(happyUrls, angryUrls) {
  newsSpriteUrlsHappy = Array.isArray(happyUrls) ? happyUrls.filter(Boolean) : [];
  newsSpriteUrlsAngry = Array.isArray(angryUrls) ? angryUrls.filter(Boolean) : [];
  lastHappySheetIndex = -1;
  lastHappyFrame = -1;
  lastAngrySheetIndex = -1;
  lastAngryFrame = -1;
  const skierEl = document.getElementById('newsSkierSprite');
  const textEl = document.getElementById('newsFeedText');
  const container = document.getElementById('newsFeedContainer');
  if (skierEl && newsSpriteUrlsHappy.length > 0) {
    skierEl.style.backgroundImage = `url(${newsSpriteUrlsHappy[0]})`;
    skierEl.style.backgroundPosition = '0% 0';
  }
  if (textEl && hasNews()) {
    textEl.textContent = `"${DEFAULT_MESSAGE}"`;
  }
  if (container) {
    container.classList.toggle('header-news--no-news', !hasNews());
  }
}

function pickSprite(spriteUrls, lastSheetIndex, lastFrame) {
  let sheetIndex;
  let frame;
  const totalSprites = spriteUrls.length * SKIER_FRAMES;
  do {
    sheetIndex = Math.floor(Math.random() * spriteUrls.length);
    frame = Math.floor(Math.random() * SKIER_FRAMES);
  } while (totalSprites > 1 && sheetIndex === lastSheetIndex && frame === lastFrame);
  return { sheetIndex, frame, url: spriteUrls[sheetIndex] };
}

export function updateNewsFeed(tickCount) {
  if (tickCount % NEWS_TICK_INTERVAL !== 0) return;
  const skierEl = document.getElementById('newsSkierSprite');
  const textEl = document.getElementById('newsFeedText');
  const container = document.getElementById('newsFeedContainer');
  if (!skierEl || !textEl) return;

  if (!hasNews()) {
    if (container) container.classList.add('header-news--no-news');
    return;
  }

  const spriteUrlsHappy = newsSpriteUrlsHappy.length > 0 ? newsSpriteUrlsHappy : newsSpriteUrlsAngry;
  const spriteUrlsAngry = newsSpriteUrlsAngry.length > 0 ? newsSpriteUrlsAngry : newsSpriteUrlsHappy;
  if (spriteUrlsHappy.length === 0 && spriteUrlsAngry.length === 0) return;

  if (container) container.classList.remove('header-news--no-news');

  const { message, isPositive } = pickMessageAndMood();
  const urls = isPositive ? spriteUrlsHappy : spriteUrlsAngry;

  if (isPositive) {
    const { sheetIndex, frame, url } = pickSprite(urls, lastHappySheetIndex, lastHappyFrame);
    lastHappySheetIndex = sheetIndex;
    lastHappyFrame = frame;
    skierEl.style.backgroundImage = `url(${url})`;
    const pct = SKIER_FRAMES > 1 ? (frame / (SKIER_FRAMES - 1)) * 100 : 0;
    skierEl.style.backgroundPosition = `${pct}% 0`;
  } else {
    const { sheetIndex, frame, url } = pickSprite(urls, lastAngrySheetIndex, lastAngryFrame);
    lastAngrySheetIndex = sheetIndex;
    lastAngryFrame = frame;
    skierEl.style.backgroundImage = `url(${url})`;
    const pct = SKIER_FRAMES > 1 ? (frame / (SKIER_FRAMES - 1)) * 100 : 0;
    skierEl.style.backgroundPosition = `${pct}% 0`;
  }

  textEl.textContent = `"${message}"`;
}
