import type { PageSnapshot } from '../lib/types';

const BLOCKED_SELECTOR = [
  'form', 'input', 'textarea', 'select', 'option', 'button',
  'nav', 'script', 'style', 'noscript', 'template', 'svg',
  '[aria-hidden="true"]', '[hidden]', '[inert]',
  '[contenteditable]:not([contenteditable="false" i])',
  '[data-private]', '[data-sensitive]',
  '[role="dialog"]', '[aria-modal="true"]',
  '[class*="checkout" i]', '[id*="checkout" i]',
  '[class*="login" i]', '[id*="login" i]',
].join(',');
const MAX_TEXT_LENGTH = 30_000;
const MAX_SECTION_LENGTH = 2_000;
const MAX_PARAGRAPHS = 300;
const MAX_HEADING_LENGTH = 300;
const MAX_HEADINGS = 80;

function isVisible(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    current = current.parentElement;
  }
  return element.getClientRects().length > 0;
}

function isSafeElement(element: Element): boolean {
  return !element.closest(BLOCKED_SELECTOR) && isVisible(element);
}

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function safeText(element: Element): string {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const pieces: string[] = [];
  let length = 0;

  for (let node = walker.nextNode(); node && length < MAX_TEXT_LENGTH; node = walker.nextNode()) {
    const parent = node.parentElement;
    const value = clean(node.textContent);
    if (!parent || !value || !isSafeElement(parent)) {
      continue;
    }
    pieces.push(value);
    length += value.length + 1;
  }

  return pieces.join(' ').slice(0, MAX_TEXT_LENGTH);
}

function meta(name: string, property = false): string {
  const attribute = property ? 'property' : 'name';
  return clean(document.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`)?.content);
}

function sanitizedPageUrl(): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function extractPageSnapshot(): PageSnapshot {
  const root = document.querySelector('main')
    ?? document.querySelector('article')
    ?? document.querySelector('[role="main"]')
    ?? document.body;
  const text = root ? safeText(root) : '';
  const paragraphs = (root ? [...root.querySelectorAll('p')] : [])
    .filter(isSafeElement)
    .map((element) => safeText(element).slice(0, MAX_SECTION_LENGTH))
    .filter((value) => value.length >= 20)
    .slice(0, MAX_PARAGRAPHS);
  const headings = (root ? [...root.querySelectorAll('h1, h2, h3')] : [])
    .filter(isSafeElement)
    .map((element) => safeText(element).slice(0, MAX_HEADING_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_HEADINGS);
  const wordCount = (text.match(/\S+/g) ?? []).length;
  const publicationDate = meta('article:published_time', true)
    || meta('date')
    || clean(document.querySelector<HTMLTimeElement>('time[datetime]')?.dateTime)
    || undefined;

  return {
    url: sanitizedPageUrl().slice(0, 4_096),
    domain: location.hostname.replace(/^www\./, '').toLowerCase(),
    title: clean(meta('og:title', true) || document.title).slice(0, 500),
    description: clean(meta('description') || meta('og:description', true)).slice(0, 2_000),
    text,
    headings,
    paragraphs,
    wordCount,
    linkCount: root ? [...root.querySelectorAll('a[href]')].filter(isSafeElement).length : 0,
    paragraphCount: paragraphs.length,
    publicationDate: publicationDate?.slice(0, 200),
    readingTimeMinutes: Math.max(1, Math.ceil(wordCount / 225)),
    extractedAt: new Date().toISOString(),
  };
}

export function canAnalyzeCurrentPage(): boolean {
  return /^https?:$/.test(location.protocol) && Boolean(document.body);
}
