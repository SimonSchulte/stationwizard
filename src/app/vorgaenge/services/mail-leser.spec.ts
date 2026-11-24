import { describe, expect, it } from 'vitest';
import { htmlZuText, leseMail, notizVon } from './mail-leser';

function mail(teile: string[]): ArrayBuffer {
  return new TextEncoder().encode(teile.join('\r\n')).buffer as ArrayBuffer;
}

describe('mail-leser', () => {
  it('macht aus HTML reinen Text ohne Skripte', () => {
    const text = htmlZuText(
      '<style>x{}</style><p>Hallo</p><script>alert(1)</script><div>Welt</div>',
    );
    expect(text).toContain('Hallo');
    expect(text).toContain('Welt');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('x{}');
  });

  it('liest Absender, Betreff, Text und Anhang einer Mail', async () => {
    const gelesen = await leseMail(
      mail([
        'From: Werkstatt Muster <werkstatt@example.org>',
        'Subject: Angebot Reparatur',
        'Date: Mon, 10 Nov 2026 10:00:00 +0000',
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="g"',
        '',
        '--g',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Anbei das Angebot.',
        '--g',
        'Content-Type: application/pdf; name="angebot.pdf"',
        'Content-Disposition: attachment; filename="angebot.pdf"',
        'Content-Transfer-Encoding: base64',
        '',
        'JVBERi0xLjQK',
        '--g--',
        '',
      ]),
    );
    expect(gelesen.von).toContain('werkstatt@example.org');
    expect(gelesen.betreff).toBe('Angebot Reparatur');
    expect(gelesen.text).toContain('Anbei das Angebot.');
    expect(gelesen.anhaenge).toHaveLength(1);
    expect(gelesen.anhaenge[0].name).toBe('angebot.pdf');
    expect(gelesen.anhaenge[0].medientyp).toBe('application/pdf');
    expect(gelesen.anhaenge[0].groesse).toBeGreaterThan(0);
  });

  it('kürzt die Notiz auf die Grenzen', () => {
    const notiz = notizVon({
      von: 'a'.repeat(500),
      betreff: 'b'.repeat(500),
      datum: null,
      text: 'c'.repeat(5000),
      anhaenge: [],
    });
    expect(notiz.absender).toHaveLength(300);
    expect(notiz.betreff).toHaveLength(300);
    expect(notiz.text).toHaveLength(2000);
    expect(notiz.datum).toBe('');
  });
});
