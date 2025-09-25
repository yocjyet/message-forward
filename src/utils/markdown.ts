const testStr = `**bold**, *italic*, and ~~strikethrough~~ text
***~~All three at once~~***

* bulleted lists
  * with sub-bullets too
  * sub-bullets start with 2 spaces
    * start sub-sub-bullets with 4 spaces
* multi
line
bullet
- dashes and
+ pluses are ok too

1. numbered lists
1. increment automatically
   1. use nested lists if you like
   3. delete or reorder lines without fixing the numbering
1. one more
   17. lists can start at any number
   18. so you can continue a list after some other text

Named link: [Zulip homepage](zulip.com)
A URL (links automatically): zulip.com
Channel link: #**channel name**
Topic link: #**channel name>topic name**
Message link: #**channel name>topic name@123**
Custom linkifier: For example, #2468 can automatically link to an issue in your tracker.

Inline code span: \`let x = 5\`

Code block:
\`\`\`
def f(x):
   return x+1
\`\`\`

Syntax highlighting:
\`\`\`python
def fib(n):
    # TODO: base case
    return fib(n-1) + fib(n-2)
\`\`\`

Inline: $$O(n^2)$$

Displayed:
\`\`\` math
\int_a^b f(t)\, dt = F(b) - F(a)
\`\`\`

> a multi-line
quote on two lines

normal text

\`\`\`quote
A multi-paragraph

quote in two paragraphs
\`\`\`

\`\`\`spoiler The spoiler heading might summarize what's inside
This content is initially hidden.

> You can combine spoilers with other formatting.

\`\`\`

A message can contain both spoilers and other content.

\`\`\`spoiler
Leave the heading blank if you like.
\`\`\`
\`\`\`

:octopus: :heart: :zulip: :)

Users: @**Bo Lin** or @**Ariella Drake|26** (two \`*\`)
User group: @*support team* (one \`*\`)
Silent mention: @_**Bo Lin** or @_**Ariella Drake|26** (\`@_\` instead of \`@\`)
Wildcard mentions: @**all**, @**everyone**, @**channel**, @**topic** (two \`*\`)

/me is away

Our next meeting is scheduled for <time:2024-08-06T17:00:00+01:00>.

|| yes | no | maybe
|---|---|:---:|------:
| A | left-aligned | centered | right-aligned
| B |     extra      spaces      |  are |  ok
| C | **bold** *italic* ~~strikethrough~~  :smile:  ||

/poll What did you drink this morning?
Milk
Tea
Coffee

/todo Today's tasks
Task 1: This is the first task.
Task 2: This is the second task.
Last task

One blank space for a new paragraph
New line, same paragraph

New paragraph

---, ***, or ___ for a horizontal line
Over the line

---

Under the line
`;

import { marked, type Token, type Tokens } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
});

console.log(marked.lexer(testStr));

const g = `abc ${bold`b`} cde ${italic`f`}`;
console.log(g);
console.log(format`${g}`);
console.log(format`${g}`.toString());
console.log(format`${g}`.toJSON());

import {
  formatSaveIndents as format,
  join as fmtJoin,
  bold,
  italic,
  underline,
  strikethrough,
  spoiler,
  code,
  pre,
  blockquote,
  link,
  type FormattableString,
  type Stringable,
} from '@gramio/format';

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
