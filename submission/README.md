# Market submission

`liujianqiao701__dsh-small-mcp-server.yml` is the entry file submitted to the DSH
plugin market, kept here so the wording is versioned alongside the code.

The market does **not** scan GitHub. It renders from a curated index built out of
[`awesome-dsh-plugin/awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin):
one YAML file per plugin under `data/plugins/`, named `<owner>__<repo>.yml`, with
the READMEs generated from those files. Editing a README directly does nothing.

Submitted as [PR #15828](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/15828).

## Entry format

```yaml
url: https://github.com/owner/repo
name: owner/repo
category: ui
description:
  en: One-line description ending with a period.
  zh: 一句话描述，以句号结尾。        # optional
icon: https://.../icon-180.png       # optional
```

Only `description.en` is required. A description containing `: ` must be quoted.
Valid categories: `agi ui usage theme model identity session memory tools wsl
browser vision voice docs skill workflow git notify dev security remote market fun`.

## Rules this submission had to satisfy

- `dsh.bundle` declared in `package.json` — declaring only `dsh.client` is the
  most common rejection, because that alone is not installable.
- Installs with `dsh plugin add`.
- Repo **at least 1 day old** (`MIN_AGE_DAYS = 1` in `scripts/check-submission.mjs`).
  There is no commit-count floor. The check re-runs itself on a schedule, so an
  age failure clears on its own — resubmitting does not help.
- Dependencies must point at the original author, not at a repackager.
- Not a meta-package (a dependency list with no code of its own).
- The PR must touch **only** the new entry file. Editing other entries or the
  generated READMEs gets it bounced.

## Duplicate risk, stated plainly

The list already carries several MCP panels, including
`Ceelog/dsh-plugins#dsh-plugin-setting-mcp`, `whiteS18/dsh-mcp-servers-panel` and
`appthin/dsh-mcp-manager-plus`. The review rule for overlaps is "whichever is
better", so being a near-copy of an existing entry is a losing position — which is
why this fork was reworked rather than republished (see the top of
[`../README.md`](../README.md) and §六 of [`../PORTING.md`](../PORTING.md)).

## Re-submitting after changes

Update the YAML here, copy it to `data/plugins/` in a clone of the fork, and push
to the same branch — the open PR picks it up. Bump `version` in `package.json`
first if the change is behavioural; the checker reads the repo as it stands, but a
reviewer will notice a description that no longer matches the code.
