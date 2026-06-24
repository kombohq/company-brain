import { describe, expect, test } from "bun:test";
import {
  accountFileName,
  parseAccountId,
  parseTicket,
  serializeAccount,
  serializeTicket,
  ticketFileName,
} from "./markdown.js";
import type { PylonAccount, PylonIssue, PylonMessage } from "./pylon-client.js";

describe("serializeTicket", () => {
  test("renders frontmatter, conversation sorted by timestamp, and account link", () => {
    const issue = makeIssue({
      body_html: "<p>It <strong>breaks</strong> on submit.</p>",
      slack: {
        workspace_id: "acme",
        channel_id: "C123",
        message_ts: "1700000000.000100",
      },
    });
    const messages: PylonMessage[] = [
      makeMessage({
        id: "m2",
        timestamp: "2025-03-04T11:00:00Z",
        message_html: "<p>We pushed a fix.</p>",
        author: { user: { email: "agent@acme.dev" } },
      }),
      makeMessage({
        id: "m1",
        timestamp: "2025-03-04T09:00:00Z",
        message_html: "<p>I cannot log in.</p>",
        author: { contact: { email: "user@customer.com" } },
      }),
    ];
    const md = serializeTicket(issue, messages, {
      name: "Customer Inc",
      file: "../accounts/customer-inc-11111111.md",
    });
    expect(md).toMatchInlineSnapshot(`
      "---
      pylon_id: 11111111-2222-3333-4444-555555555555
      number: 42
      title: Login fails
      state: closed
      type: null
      created_at: '2025-03-04T09:00:00Z'
      updated_at: '2025-03-05T12:00:00Z'
      first_response_time: null
      first_response_seconds: null
      resolution_time: null
      resolution_seconds: null
      number_of_touches: null
      time_in_status_seconds: null
      csat_score: null
      csat_comment: null
      source: null
      slack:
        workspace_id: acme
        channel_id: C123
        message_ts: '1700000000.000100'
      slack_url: 'https://acme.slack.com/archives/C123/p1700000000000100'
      tags: []
      requester: user@customer.com
      assignee_id: null
      account_id: null
      account: Customer Inc
      account_file: ../accounts/customer-inc-11111111.md
      link: 'https://app.usepylon.com/issues/11111111-2222-3333-4444-555555555555'
      ---

      # [TICKET-42] Login fails

      - **Account:** [Customer Inc](../accounts/customer-inc-11111111.md)
      - **Slack:** [open thread](https://acme.slack.com/archives/C123/p1700000000000100)
      - **Resolution time:** —

      ## Description

      It **breaks** on submit.

      ---

      ## Conversation

      ### Customer (user@customer.com) (2025-03-04T09:00:00Z)

      I cannot log in.

      ### Agent (agent@acme.dev) (2025-03-04T11:00:00Z)

      We pushed a fix.
      "
    `);
  });

  test("derives requester from the first non-private message and builds slack_url", () => {
    const issue = makeIssue({
      slack: {
        workspace_id: "acme",
        channel_id: "C999",
        message_ts: "1700000000.123456",
      },
    });
    const messages: PylonMessage[] = [
      makeMessage({
        id: "note",
        is_private: true,
        timestamp: "2025-03-04T08:00:00Z",
        message_html: "<p>triage</p>",
        author: { contact: { email: "internal@acme.dev" } },
      }),
      makeMessage({
        id: "first-public",
        timestamp: "2025-03-04T09:00:00Z",
        author: { contact: { email: "requester@customer.com" } },
      }),
    ];
    const md = serializeTicket(issue, messages);
    expect(md).toContain("requester: requester@customer.com");
    expect(md).toContain(
      "slack_url: 'https://acme.slack.com/archives/C999/p1700000000123456'",
    );
    expect(md).toContain(
      "- **Slack:** [open thread](https://acme.slack.com/archives/C999/p1700000000123456)",
    );
  });

  test("omits the account link when no account is passed", () => {
    const md = serializeTicket(makeIssue(), [makeMessage()]);
    expect(md).not.toContain("**Account:**");
    expect(md).toContain("account: null");
  });

  test("renders resolution time as hours and minutes", () => {
    const md = serializeTicket(makeIssue({ resolution_seconds: 3700 }), [
      makeMessage(),
    ]);
    expect(md).toContain("resolution_seconds: 3700");
    expect(md).toContain("- **Resolution time:** 1h 1m");
  });

  test("renders a minutes-only resolution time", () => {
    const md = serializeTicket(makeIssue({ resolution_seconds: 120 }), [
      makeMessage(),
    ]);
    expect(md).toContain("- **Resolution time:** 2m");
  });

  test("renders non-empty custom fields and drops empty ones", () => {
    const md = serializeTicket(
      makeIssue({
        custom_fields: {
          regions: { values: ["EU", "US"] },
          plan: { value: "enterprise" },
          notes: { value: "" },
        },
      }),
      [makeMessage()],
    );
    expect(md).toContain("custom_fields:");
    expect(md).toContain("regions: 'EU, US'");
    expect(md).toContain("plan: enterprise");
    expect(md).not.toContain("notes:");
  });

  test("omits custom_fields entirely when every field is empty", () => {
    const md = serializeTicket(
      makeIssue({ custom_fields: { notes: { value: "" } } }),
      [makeMessage()],
    );
    expect(md).not.toContain("custom_fields:");
  });

  test("renders a CSAT score with comment in body and frontmatter", () => {
    const md = serializeTicket(
      makeIssue({ csat_responses: [{ score: 4, comment: "Quick help" }] }),
      [makeMessage()],
    );
    expect(md).toContain("csat_score: 4");
    expect(md).toContain("csat_comment: Quick help");
    expect(md).toContain('- **CSAT:** 4/5 — "Quick help"');
  });

  test("renders a CSAT score without a comment", () => {
    const md = serializeTicket(makeIssue({ csat_responses: [{ score: 5 }] }), [
      makeMessage(),
    ]);
    expect(md).toContain("csat_score: 5");
    expect(md).toContain("- **CSAT:** 5/5");
    expect(md).not.toContain('5/5 — "');
  });

  test("rewrites an expiring usepylon image to a placeholder", () => {
    const md = serializeTicket(
      makeIssue({
        body_html:
          '<p><img src="https://assets.usepylon.com/x.png?Signature=abc&Expires=123" alt="error screen"></p>',
      }),
      [
        makeMessage({
          message_html:
            '<p><img src="https://assets.usepylon.com/y.png?Signature=def&Expires=456"></p>',
        }),
      ],
    );
    expect(md).toContain("[image: error screen]");
    expect(md).toContain("[image]");
    expect(md).not.toContain("Signature=");
    expect(md).not.toContain("assets.usepylon.com");
  });
});

describe("serializeAccount", () => {
  test("lists tickets sorted by number descending", () => {
    const account: PylonAccount = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      name: "Customer Inc",
      domain: "customer.com",
      type: "customer",
    };
    const md = serializeAccount(account, [
      { fileName: "2025-03-04-TICKET-7.md", number: 7, title: "Older" },
      { fileName: "2025-03-09-TICKET-42.md", number: 42, title: "Newer" },
    ]);
    expect(md).toMatchInlineSnapshot(`
      "---
      pylon_account_id: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
      name: Customer Inc
      domain: customer.com
      domains: []
      type: customer
      external_ids: []
      created_at: null
      updated_at: null
      ---

      # Customer Inc

      - **Domain:** customer.com
      - **Type:** customer
      - **Pylon account id:** aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

      ## Tickets (2)

      - [TICKET-42 — Newer](../tickets/2025-03-09-TICKET-42.md)
      - [TICKET-7 — Older](../tickets/2025-03-04-TICKET-7.md)
      "
    `);
  });

  test("shows the empty state when there are no tickets", () => {
    const account: PylonAccount = { id: "id-1", name: "Empty Co" };
    const md = serializeAccount(account, []);
    expect(md).toContain("## Tickets (0)");
    expect(md).toContain("_No synced tickets._");
  });
});

describe("file names", () => {
  test("ticketFileName uses creation date and ticket number", () => {
    const name = ticketFileName(
      makeIssue({ number: 42, created_at: "2025-03-04T09:00:00Z" }),
    );
    expect(name).toBe("2025-03-04-TICKET-42.md");
  });

  test("accountFileName slugifies a messy name and appends a short id", () => {
    const account: PylonAccount = {
      id: "d9149b84-1111-2222-3333-444444444444",
      name: "  Pült & Co.  ",
    };
    expect(accountFileName(account)).toBe("pult-co-d9149b84.md");
  });

  test("accountFileName falls back to 'account' when the name is missing", () => {
    const name = accountFileName({
      id: "abcdef12-0000-0000-0000-000000000000",
    });
    expect(name).toBe("account-abcdef12.md");
  });
});

describe("parse round-trips", () => {
  test("parseTicket reads back what serializeTicket wrote", () => {
    const issue = makeIssue({
      id: "issue-xyz",
      number: 7,
      title: "Round trip",
      updated_at: "2025-03-05T12:00:00Z",
      account: { id: "acct-1" },
    });
    const md = serializeTicket(issue, [makeMessage()]);
    expect(parseTicket(md)).toEqual({
      pylonId: "issue-xyz",
      updatedAt: "2025-03-05T12:00:00Z",
      accountId: "acct-1",
      number: 7,
      title: "Round trip",
    });
  });

  test("parseTicket returns null without the marker", () => {
    expect(parseTicket("# just a heading")).toBeNull();
  });

  test("parseAccountId reads back what serializeAccount wrote", () => {
    const account: PylonAccount = { id: "acct-77", name: "Acme" };
    const md = serializeAccount(account, []);
    expect(parseAccountId(md)).toBe("acct-77");
  });

  test("parseAccountId returns null without the marker", () => {
    expect(parseAccountId("# just a heading")).toBeNull();
  });
});

function makeIssue(overrides: Partial<PylonIssue> = {}): PylonIssue {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    number: 42,
    title: "Login fails",
    state: "closed",
    created_at: "2025-03-04T09:00:00Z",
    updated_at: "2025-03-05T12:00:00Z",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<PylonMessage> = {}): PylonMessage {
  return {
    id: "msg-1",
    message_html: "<p>Hello</p>",
    timestamp: "2025-03-04T09:00:00Z",
    is_private: false,
    ...overrides,
  };
}
