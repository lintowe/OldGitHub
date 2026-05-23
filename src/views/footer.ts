import { octicon } from "@/icons";

// 2013 GitHub footer: full-width strip below the page, centered 980px
// inner, simple link list with the Octocat mark on the left. Mounted
// once at boot and stays put across navigations. CSS hides it on
// out-of-scope routes so the native page renders cleanly.
export function mountFooter(): void {
  if (document.querySelector(".oldgh-footer")) return;
  const footer = document.createElement("footer");
  footer.className = "oldgh-footer";
  footer.dataset.oldgh = "footer";
  footer.innerHTML = renderFooterHtml();
  document.body.append(footer);
}

function renderFooterHtml(): string {
  const year = new Date().getUTCFullYear();
  const mark = octicon("mark-github", { size: 24, ariaLabel: "GitHub" });
  // 2013 had a short, opinionated link strip. Modern GitHub footers are
  // bloated; we lean toward the 2013 voice — Status, API, the docs/help
  // page, the things you'd reach for in the moment.
  const links: Array<{ label: string; href: string }> = [
    { label: "Status", href: "https://www.githubstatus.com" },
    { label: "Docs", href: "https://docs.github.com" },
    { label: "Pricing", href: "https://github.com/pricing" },
    { label: "API", href: "https://docs.github.com/rest" },
    { label: "Training", href: "https://github.com/skills" },
    { label: "Blog", href: "https://github.blog" },
    { label: "About", href: "https://github.com/about" },
    { label: "Terms", href: "https://docs.github.com/site-policy/github-terms/github-terms-of-service" },
    { label: "Privacy", href: "https://docs.github.com/site-policy/privacy-policies/github-privacy-statement" },
    { label: "Contact", href: "https://support.github.com/contact" },
  ];
  const linksHtml = links
    .map((l) => `<li><a href="${l.href}" rel="noopener">${l.label}</a></li>`)
    .join("");
  return `
    <div class="oldgh-footer__inner">
      <a class="oldgh-footer__mark" href="/" aria-label="GitHub">${mark}</a>
      <ul class="oldgh-footer__links">
        <li class="oldgh-footer__year">&copy; ${year} GitHub, Inc.</li>
        ${linksHtml}
      </ul>
    </div>
  `;
}
