import { marked, type Token, type Tokens } from 'marked';
import {
  formatSaveIndents as format,
  join as fmtJoin,
  bold,
  italic,
  strikethrough,
  code,
  pre,
  blockquote,
  link,
  type FormattableString,
  type Stringable,
} from '@gramio/format';

marked.setOptions({
  gfm: true,
  breaks: true,
});

// --- helpers ---------------------------------------------------------------

function concatParts(parts: Stringable[], sep = ''): FormattableString {
  // Use GramIO's format + join so entities survive concatenation
  return format`${fmtJoin(parts, (x) => x, sep)}`;
}

function softTrim(s: string): string {
  // Keep Markdown's occasional double spaces/newlines tidy
  return s.replace(/\s+$/g, '');
}

function convertInlines(
  tokens: Tokens.ListItem['tokens'] | Tokens.Text['tokens'] | Token[] | undefined,
  options?: { baseUrl?: string }
): FormattableString {
  if (!tokens || tokens.length === 0) return format``;
  const parts = tokens.map((t) => convertToken(t, options)).filter(Boolean) as Stringable[];
  return concatParts(parts);
}

// --- main dispatcher -------------------------------------------------------

function resolveHref(href: string, baseUrl?: string): string {
  try {
    // If already absolute (has scheme), return as-is
    const u = new URL(href);
    return u.toString();
  } catch {}

  // Prepend scheme if schemeless domain like "example.com"
  if (/^[\w.-]+\.[A-Za-z]{2,}(?:[/:?#].*)?$/.test(href)) {
    try {
      return new URL(`https://${href}`).toString();
    } catch {}
  }

  // If base provided, resolve relative or root-relative paths
  if (baseUrl) {
    try {
      return new URL(href, baseUrl).toString();
    } catch {}
  }

  return href;
}

export function convertToken(token: Token | undefined, options?: { baseUrl?: string }): Stringable {
  if (!token) return '';

  switch (token.type) {
    // Block-level -----------------------------------------------------------
    case 'heading': {
      // Render headings as bold (H1/2 get underline feel with extra newlines)
      const content = convertInlines((token as Tokens.Heading).tokens, options);
      const styled = token.depth <= 2 ? format`${bold(content)}` : format`${bold(content)}`;
      const above = token.depth === 1 ? '\n' : '';
      const below = '\n';
      return format`${above}${styled}\n${below}`;
    }

    case 'paragraph': {
      const p = convertInlines((token as Tokens.Paragraph).tokens, options);
      return format`${p}\n`;
    }

    case 'blockquote': {
      // GramIO has a blockquote entity
      const inner = (token as Tokens.Blockquote).tokens?.map((t) => convertToken(t, options)) ?? [];
      // Join paragraphs inside the quote with line breaks
      const quoted = concatParts(inner, '\n');
      return format`${blockquote(quoted)}\n`;
    }

    case 'list': {
      const t = token as Tokens.List;
      const start = typeof t.start === 'number' ? t.start : parseInt(t.start || '1', 10) || 1;

      const items = t.items.map((it, i) => {
        const line = convertInlines(it.tokens, options);
        const bullet = t.ordered ? `${start + i}. ` : `• `;
        return format`${bullet}${line}`;
      });

      const body = concatParts(items, '\n');
      return format`${body}\n`;
    }

    case 'space':
      return '\n';

    case 'code': {
      const t = token as Tokens.Code;
      // fenced / indented both map to pre; language may be undefined
      return format`${pre(t.text, t.lang)}\n`;
    }

    // Inline-level ----------------------------------------------------------
    case 'text': {
      const t = token as Tokens.Text;
      // If Marked already broke this into nested inline tokens, render them.
      if (t.tokens && t.tokens.length) return convertInlines(t.tokens, options);
      return softTrim(t.text);
    }

    case 'strong': {
      const inner = convertInlines((token as Tokens.Strong).tokens, options);
      return bold(inner);
    }

    case 'em': {
      const inner = convertInlines((token as Tokens.Em).tokens, options);
      return italic(inner);
    }

    case 'del': {
      const inner = convertInlines((token as Tokens.Del).tokens, options);
      return strikethrough(inner);
    }

    case 'codespan': {
      const t = token as Tokens.Codespan;
      return code(t.text);
    }

    case 'link': {
      const t = token as Tokens.Link;
      const label = convertInlines(t.tokens, options);
      const href = resolveHref(t.href, options?.baseUrl);
      // GramIO link cannot combine with code/pre (which we don’t here)
      return link(label, href);
    }

    case 'image': {
      // No image entity in GramIO. Render alt (or URL) as plain text.
      const t = token as Tokens.Image;
      return t.text || t.href || '';
    }

    case 'br':
      return '\n';

    case 'html':
      // Raw HTML is not supported in Telegram entities; strip it.
      return '';

    case 'def':
      // Link reference definition — skip (we already get resolved tokens).
      return '';

    default:
      // Fallback: try nested tokens or raw text
      return convertInlines((token as any).tokens, options) || (token as any).raw || '';
  }
}

// --- public API ------------------------------------------------------------

export function convertMarkdownToGramio(markdown: string, options?: { baseUrl?: string }): FormattableString {
  const tokens = marked.lexer(markdown);
  const blocks = tokens.map((t) => convertToken(t, options));
  // Separate top-level blocks with single newline (most blocks already end with \n)
  return concatParts(blocks, '');
}
