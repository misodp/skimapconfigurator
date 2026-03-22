/**
 * Header news feed: shows a new item every 3 simulation ticks based on lift wait, slope crowds and slope quality.
 *
 * Default copy: assets/data/news-feed.json (bundled at build time).
 * For another language, keep the same JSON shape in e.g. news-feed.si.json and change the import path below.
 */

import { state } from './state';
import newsFeedCopy from '../assets/data/news-feed.json';

const NEWS_TICK_INTERVAL = 3;
const SKIER_FRAMES = 5;
/** Experience 0–100: above this = positive news, else negative. */
const POSITIVE_THRESHOLD = 50;

const NEWS_LIFT_POSITIVE = newsFeedCopy.lift.positive;
const NEWS_LIFT_NEGATIVE = newsFeedCopy.lift.negative;
const NEWS_CROWD_POSITIVE = newsFeedCopy.crowd.positive;
const NEWS_CROWD_NEGATIVE = newsFeedCopy.crowd.negative;
const NEWS_QUALITY_POSITIVE = newsFeedCopy.quality.positive;
const NEWS_QUALITY_NEGATIVE = newsFeedCopy.quality.negative;
const DEFAULT_MESSAGE = newsFeedCopy.defaultMessage;

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
