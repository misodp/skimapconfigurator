/**
 * Header news feed: shows a new item every 3 simulation ticks based on lift wait, slope crowds and slope quality.
 *
 * Default copy: assets/data/news-feed.json. Slovenian: news-feed.si.json (loaded when locale session flag is set).
 */

import defaultNewsFeedCopy from '../assets/data/news-feed.json';
import { state } from './state';

const NEWS_TICK_INTERVAL = 3;
const SKIER_FRAMES = 5;
/** Experience 0–100: above this = positive news, else negative. */
const POSITIVE_THRESHOLD = 50;

/** @type {typeof defaultNewsFeedCopy} */
let activeNewsFeedCopy = defaultNewsFeedCopy;

/**
 * Replace news strings (same JSON shape as news-feed.json). Used after fetch of news-feed.si.json.
 * @param {unknown} copy
 */
export function setNewsFeedCopy(copy) {
  if (!copy || typeof copy !== 'object') return;
  const n = /** @type {typeof defaultNewsFeedCopy} */ (copy);
  if (typeof n.defaultMessage !== 'string') return;
  if (!Array.isArray(n.lift?.positive) || !Array.isArray(n.lift?.negative)) return;
  if (!Array.isArray(n.crowd?.positive) || !Array.isArray(n.crowd?.negative)) return;
  if (!Array.isArray(n.quality?.positive) || !Array.isArray(n.quality?.negative)) return;
  activeNewsFeedCopy = n;
}

function getCopy() {
  return activeNewsFeedCopy;
}

/** Picks a message and whether it's positive (happy) or negative (angry). */
function pickMessageAndMood() {
  const news = getCopy();
  const categories = [
    { value: state.liftExperience, positive: news.lift.positive, negative: news.lift.negative },
    { value: state.slopeCrowdExperience, positive: news.crowd.positive, negative: news.crowd.negative },
    { value: state.slopeQualityExperience, positive: news.quality.positive, negative: news.quality.negative },
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
  const defaultMsg = getCopy().defaultMessage;
  if (textEl && hasNews()) {
    textEl.textContent = `"${defaultMsg}"`;
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
