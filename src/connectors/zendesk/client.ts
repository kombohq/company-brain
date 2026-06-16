/**
 * Anonymous Zendesk Help Center API client.
 *
 * Published articles are readable without auth, and the list endpoint already
 * returns each article's full HTML `body`, so the sync only pages through this
 * one endpoint, no per-article fetch and no token.
 * https://developer.zendesk.com/api-reference/help_center/help-center-api/articles/
 */

export const ARTICLES_PER_PAGE = 100;

export interface HelpCenterArticle {
  id: number;
  html_url?: string;
  title?: string;
  body?: string;
  locale?: string;
  draft?: boolean;
  section_id?: number;
  created_at?: string;
  updated_at?: string;
  edited_at?: string;
  label_names?: string[];
}

interface ArticlesListResponse {
  articles: HelpCenterArticle[];
  count: number;
  page_count: number;
  next_page: string | null;
}

export class ZendeskHelpCenterClient {
  private readonly baseUrl: string;

  /**
   * @param subdomain the `X` in `X.zendesk.com`
   * @param locale Guide locale segment; note `en` alone returns an empty list on
   *   some instances, so callers should pass the full locale (e.g. `en-us`)
   */
  constructor(
    private readonly subdomain: string,
    private readonly locale: string,
  ) {
    this.baseUrl = `https://${subdomain}.zendesk.com`;
  }

  firstPageUrl(): string {
    const q = new URLSearchParams({ per_page: String(ARTICLES_PER_PAGE) });
    return `${this.baseUrl}/api/v2/help_center/${this.locale}/articles.json?${q}`;
  }

  /** Yield every published article, page by page, following `next_page`. */
  async *articles(): AsyncGenerator<HelpCenterArticle> {
    let url: string | null = this.firstPageUrl();
    while (url) {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Zendesk Help Center API ${res.status} for ${url}: ${body.slice(0, 300)}`,
        );
      }
      const page = (await res.json()) as ArticlesListResponse;
      for (const article of page.articles) {
        if (article.draft !== true) {
          yield article;
        }
      }
      url = page.next_page;
    }
  }
}
