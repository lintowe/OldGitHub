import { octicon } from "@/icons";
import {
  getIssue,
  getPull,
  type IssueDetail,
  type PullDetail,
  type TimelineNode,
  type Actor,
  type Label,
  type ReactionCount,
} from "@/adapters/repo-issue";
import { absoluteTime, relativeTime } from "@/util/time";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";

const ROOT_CLASS = "oldgh-repo-issue";

export async function mountRepoIssue(
  owner: string,
  repo: string,
  number: number,
  kind: "issue" | "pull",
): Promise<void> {
  const view = kind === "pull"
    ? await getPull(owner, repo, number)
    : await getIssue(owner, repo, number);

  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  root.innerHTML = renderShell(view, kind);
  adoptBodyRoot(root, ".oldgh-repo-header");
}

export function unmountRepoIssue(): void {
  removeAllBodyRoots();
}

function renderShell(v: IssueDetail | PullDetail, kind: "issue" | "pull"): string {
  const isPull = kind === "pull";
  const pull = isPull ? (v as PullDetail) : null;

  return `
    <div class="oldgh-page oldgh-issue">
      <header class="oldgh-issue__header">
        <h1 class="oldgh-issue__title">
          ${sanitizeTitleHtml(v.titleHtml)}
          <span class="oldgh-issue__number">#${v.number}</span>
        </h1>
        <div class="oldgh-issue__meta">
          ${renderStateBadge(v, isPull)}
          <span class="oldgh-issue__byline">
            <a href="/${escapeAttr(v.author?.login || "")}">${escapeText(v.author?.login || "ghost")}</a>
            opened this ${isPull ? "pull request" : "issue"} ${relativeTimeLink(v.createdAt)}
            ${pull ? renderPullRefs(pull) : ""}
            · ${v.totalTimelineCount} ${v.totalTimelineCount === 1 ? "comment" : "comments"}
          </span>
        </div>
      </header>

      <div class="oldgh-issue__layout">
        <div class="oldgh-issue__main">
          ${renderTimelineGroup(v)}
        </div>
        <aside class="oldgh-issue__sidebar">
          ${renderSidebar(v)}
        </aside>
      </div>
    </div>
  `;
}

function renderStateBadge(v: IssueDetail | PullDetail, isPull: boolean): string {
  let cls = "oldgh-issue__state oldgh-issue__state--open";
  let icon = "issue-opened";
  let label = "Open";
  if (isPull) {
    const p = v as PullDetail;
    if (p.state === "MERGED") {
      cls = "oldgh-issue__state oldgh-issue__state--merged";
      icon = "git-merge";
      label = "Merged";
    } else if (p.state === "CLOSED") {
      cls = "oldgh-issue__state oldgh-issue__state--closed";
      icon = "git-pull-request";
      label = "Closed";
    } else if (p.isDraft) {
      cls = "oldgh-issue__state oldgh-issue__state--draft";
      icon = "git-pull-request";
      label = "Draft";
    } else {
      icon = "git-pull-request";
    }
  } else {
    if (v.state === "CLOSED") {
      cls = "oldgh-issue__state oldgh-issue__state--closed";
      icon = "issue-closed";
      label = v.stateReason === "NOT_PLANNED" ? "Closed (not planned)" : "Closed";
    }
  }
  return `<span class="${cls}">${octicon(icon, { size: 14 })}<span>${label}</span></span>`;
}

function renderPullRefs(p: PullDetail): string {
  const fromLabel = p.headRepoOwner && p.headRepoOwner !== p.owner
    ? `${p.headRepoOwner}:${p.headRefName}`
    : p.headRefName;
  return `
    · <code class="oldgh-issue__ref">${escapeText(p.baseRefName)}</code>
    ${octicon("arrow-left", { size: 12 })}
    <code class="oldgh-issue__ref">${escapeText(fromLabel)}</code>
  `;
}

function renderTimelineGroup(v: IssueDetail | PullDetail): string {
  const opener = renderOpenerComment(v);
  const items = v.timeline.map((node) => renderTimelineItem(node)).join("");
  return `<div class="oldgh-issue__timeline">${opener}${items}</div>`;
}

function renderOpenerComment(v: IssueDetail | PullDetail): string {
  return renderCommentBlock({
    author: v.author,
    bodyHtml: v.bodyHtml,
    createdAt: v.createdAt,
    reactions: v.reactions,
    isOpener: true,
  });
}

function renderTimelineItem(node: TimelineNode): string {
  if (node.kind === "comment") {
    return renderCommentBlock({
      author: node.author,
      bodyHtml: node.bodyHtml,
      createdAt: node.createdAt,
      reactions: node.reactions,
      authorAssociation: node.authorAssociation,
      isOpener: false,
    });
  }
  return renderEvent(node);
}

type CommentInputs = {
  author: Actor | null;
  bodyHtml: string;
  createdAt: string;
  reactions: ReactionCount[];
  authorAssociation?: string | null;
  isOpener: boolean;
};

function renderCommentBlock(c: CommentInputs): string {
  const login = c.author?.login || "ghost";
  const avatar = c.author?.avatarUrl || `https://github.com/${login}.png?size=64`;
  const association = c.authorAssociation && c.authorAssociation !== "NONE" && c.authorAssociation !== "MEMBER"
    ? `<span class="oldgh-issue__association">${escapeText(formatAssociation(c.authorAssociation))}</span>`
    : "";
  return `
    <article class="oldgh-issue__comment ${c.isOpener ? "oldgh-issue__comment--opener" : ""}">
      <a class="oldgh-issue__avatar" href="/${escapeAttr(login)}">
        <img src="${escapeAttr(avatar)}" alt="" width="44" height="44" />
      </a>
      <div class="oldgh-issue__comment-card">
        <header class="oldgh-issue__comment-head">
          <a href="/${escapeAttr(login)}" class="oldgh-issue__comment-author">${escapeText(login)}</a>
          <span class="oldgh-issue__comment-time">commented ${relativeTimeLink(c.createdAt)}</span>
          ${association}
        </header>
        <div class="oldgh-issue__body markdown-body">
          ${sanitizeBodyHtml(c.bodyHtml) || '<p class="oldgh-issue__empty">No description provided.</p>'}
        </div>
        ${renderReactionRow(c.reactions)}
      </div>
    </article>
  `;
}

function renderReactionRow(reactions: ReactionCount[]): string {
  if (!reactions || reactions.length === 0) return "";
  return `
    <div class="oldgh-issue__reactions">
      ${reactions.map((r) => `<span class="oldgh-issue__reaction" title="${escapeAttr(reactionLabel(r.content))}">${reactionEmoji(r.content)} ${r.count}</span>`).join("")}
    </div>
  `;
}

function renderEvent(e: Extract<TimelineNode, { kind: "event" }>): string {
  const actor = e.actor?.login || "someone";
  const when = relativeTimeLink(e.createdAt);
  let icon = "primitive-dot";
  let line = "";

  switch (e.type) {
    case "LabeledEvent":
      icon = "tag";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> added the ${e.label ? renderLabelInline(e.label) : "(unknown)"} label ${when}`;
      break;
    case "UnlabeledEvent":
      icon = "tag";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> removed the ${e.label ? renderLabelInline(e.label) : "(unknown)"} label ${when}`;
      break;
    case "AssignedEvent":
      icon = "person";
      line = e.assignee && e.assignee.login !== actor
        ? `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> assigned <a href="/${escapeAttr(e.assignee.login)}">${escapeText(e.assignee.login)}</a> ${when}`
        : `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> self-assigned this ${when}`;
      break;
    case "UnassignedEvent":
      icon = "person";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> unassigned ${e.assignee ? `<a href="/${escapeAttr(e.assignee.login)}">${escapeText(e.assignee.login)}</a>` : "someone"} ${when}`;
      break;
    case "MilestonedEvent":
      icon = "milestone";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> added this to a milestone ${when}`;
      break;
    case "ClosedEvent":
      icon = "issue-closed";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> closed this ${e.toState && e.toState !== "COMPLETED" ? `as ${escapeText(e.toState.toLowerCase())}` : ""} ${when}`;
      break;
    case "ReopenedEvent":
      icon = "issue-reopened";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> reopened this ${when}`;
      break;
    case "MergedEvent":
      icon = "git-merge";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> merged commit ${e.commitOid ? `<code>${escapeText(e.commitOid)}</code>` : ""} ${when}`;
      break;
    case "RenamedTitleEvent":
      icon = "pencil";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> changed the title from <strong>${escapeText(e.fromState || "")}</strong> to <strong>${escapeText(e.toState || "")}</strong> ${when}`;
      break;
    case "ReferencedEvent":
    case "CrossReferencedEvent":
      icon = "bookmark";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> referenced this ${e.refUrl ? `in <a href="${escapeAttr(e.refUrl)}">${escapeText(e.refTitle || e.ref || "another item")}</a>` : ""} ${when}`;
      break;
    case "PullRequestCommit":
    case "Commit":
      icon = "git-commit";
      line = `${e.commitOid ? `<code>${escapeText(e.commitOid)}</code>` : ""} ${e.commitMessageHeadline ? sanitizeBodyHtml(e.commitMessageHeadline) : ""} ${when}`;
      break;
    case "HeadRefForcePushedEvent":
    case "BaseRefForcePushedEvent":
      icon = "repo-force-push";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> force-pushed ${e.fromState ? `from <code>${escapeText(e.fromState)}</code>` : ""} ${e.toState ? `to <code>${escapeText(e.toState)}</code>` : ""} ${when}`;
      break;
    case "HeadRefDeletedEvent":
      icon = "trashcan";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> deleted the branch ${when}`;
      break;
    case "ReadyForReviewEvent":
      icon = "git-pull-request";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> marked this as ready for review ${when}`;
      break;
    case "SubscribedEvent":
    case "UnsubscribedEvent":
    case "MentionedEvent":
      return "";
    default:
      icon = "primitive-dot";
      line = `<a href="/${escapeAttr(actor)}">${escapeText(actor)}</a> ${escapeText(humanizeEventType(e.type))} ${when}`;
  }

  return `
    <div class="oldgh-issue__event">
      <span class="oldgh-issue__event-icon">${octicon(icon, { size: 14 })}</span>
      <span class="oldgh-issue__event-line">${line}</span>
    </div>
  `;
}

function renderSidebar(v: IssueDetail | PullDetail): string {
  return `
    ${renderSidebarSection("Assignees", v.assignees.length === 0 ? `<p class="oldgh-issue__sidebar-empty">No one assigned</p>` : `
      <ul class="oldgh-issue__assignees">
        ${v.assignees.map((a) => `
          <li>
            <a href="/${escapeAttr(a.login)}">
              <img src="${escapeAttr(a.avatarUrl)}" width="20" height="20" alt="" />
              ${escapeText(a.login)}
            </a>
          </li>`).join("")}
      </ul>
    `)}

    ${renderSidebarSection("Labels", v.labels.length === 0 ? `<p class="oldgh-issue__sidebar-empty">None yet</p>` : `
      <ul class="oldgh-issue__labels">
        ${v.labels.map((l) => `<li>${renderLabelInline(l)}</li>`).join("")}
      </ul>
    `)}

    ${renderSidebarSection("Milestone", v.milestone ? `
      <a href="${escapeAttr(v.milestone.url)}">${escapeText(v.milestone.title)}</a>
    ` : `<p class="oldgh-issue__sidebar-empty">No milestone</p>`)}
  `;
}

function renderSidebarSection(title: string, body: string): string {
  return `
    <div class="oldgh-issue__sidebar-section">
      <h3>${escapeText(title)}</h3>
      ${body}
    </div>
  `;
}

function renderLabelInline(l: Label): string {
  return `<span class="oldgh-issue__label" style="background:#${escapeAttr(l.color)};color:${labelTextColor(l.color)};" title="${escapeAttr(l.description || "")}">${escapeText(l.name)}</span>`;
}

function relativeTimeLink(iso: string): string {
  if (!iso) return "";
  const rel = relativeTime(iso);
  const abs = absoluteTime(iso);
  return `<span title="${escapeAttr(abs)}">${escapeText(rel)}</span>`;
}

function sanitizeTitleHtml(html: string): string {
  return html
    .replace(/<\/?(script|style)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function sanitizeBodyHtml(html: string): string {
  return html
    .replace(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function labelTextColor(hex: string): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex);
  if (!m || !m[1]) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#333" : "#fff";
}

function reactionEmoji(content: string): string {
  switch (content) {
    case "THUMBS_UP": return "\u{1F44D}";
    case "THUMBS_DOWN": return "\u{1F44E}";
    case "LAUGH": return "\u{1F604}";
    case "HOORAY": return "\u{1F389}";
    case "CONFUSED": return "\u{1F615}";
    case "HEART": return "❤️";
    case "ROCKET": return "\u{1F680}";
    case "EYES": return "\u{1F440}";
    default: return "";
  }
}

function reactionLabel(content: string): string {
  return content.toLowerCase().replace(/_/g, " ");
}

function formatAssociation(a: string): string {
  switch (a) {
    case "OWNER": return "Owner";
    case "COLLABORATOR": return "Collaborator";
    case "MEMBER": return "Member";
    case "CONTRIBUTOR": return "Contributor";
    case "FIRST_TIME_CONTRIBUTOR": return "First-time contributor";
    case "FIRST_TIMER": return "First-timer";
    default: return a.toLowerCase();
  }
}

function humanizeEventType(t: string): string {
  return t
    .replace(/Event$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
