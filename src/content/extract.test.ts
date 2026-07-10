import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractPageSnapshot } from './extract';

beforeEach(() => {
  history.replaceState({}, '', '/article?token=secret#account');
  document.head.innerHTML = '<meta name="description" content="A careful local report">';
  document.body.innerHTML = '';
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
});

describe('extractPageSnapshot', () => {
  it('extracts readable structure while excluding private, hidden, and form content', () => {
    document.title = 'Measured results';
    document.body.innerHTML = `
      <main>
        <h1>Measured results <span aria-hidden="true">secret heading</span></h1>
        <p>Visible evidence from a carefully documented independent trial.</p>
        <p>Another useful paragraph <span data-private>private account number</span> remains safe.</p>
        <a href="/evidence">Supporting evidence</a>
        <div contenteditable>Private draft notes must not be collected.</div>
        <div contenteditable="plaintext-only">Another private draft must not be collected.</div>
        <form><label>Password <input value="not-collected"></label></form>
        <div style="opacity: 0"><p>Invisible promotional filler should not be collected.</p></div>
      </main>
      <aside><a href="/unrelated">Unrelated sidebar link</a></aside>
    `;

    const snapshot = extractPageSnapshot();

    expect(snapshot.title).toBe('Measured results');
    expect(snapshot.description).toBe('A careful local report');
    expect(snapshot.url).toBe('http://localhost:3000/article');
    expect(snapshot.text).toContain('Visible evidence');
    expect(snapshot.text).not.toContain('private account number');
    expect(snapshot.text).not.toContain('not-collected');
    expect(snapshot.text).not.toContain('Private draft');
    expect(snapshot.text).not.toContain('Another private draft');
    expect(snapshot.text).not.toContain('Invisible promotional filler');
    expect(snapshot.headings).toEqual(['Measured results']);
    expect(snapshot.paragraphs).toHaveLength(2);
    expect(snapshot.linkCount).toBe(1);
  });

  it('prefers main content over an earlier article teaser', () => {
    document.body.innerHTML = `
      <article><p>This teaser appears first but should not be selected.</p></article>
      <main><p>The primary report contains the complete evidence and detailed conclusions.</p></main>
    `;

    const snapshot = extractPageSnapshot();

    expect(snapshot.text).toContain('primary report');
    expect(snapshot.text).not.toContain('teaser');
  });
});
