/**
 * MCP settings page UI. Mounted into the `settings.section` slot; lists the
 * managed MCP servers with live status, stages edits locally (add / edit /
 * remove / enable-disable), and commits them through `remote.mcp.save` —
 * the host reconciles the loader tree and each change hot-reloads the affected
 * `dsh-mcp-client` entry.
 *
 * Styling uses the DSH design tokens (`--dsw-alias-*`); the stylesheet is
 * injected once by the client plugin body.
 *
 * @module dsh-small-mcp-server
 */
import type { McpRemote } from "./remote.js";
import type { McpLocaleKey } from "./locales.js";
/** The translate seat of this plugin's `dsh-small-mcp-server` locale namespace. */
export type PanelTranslate = (key: McpLocaleKey, params?: Record<string, string | number>) => string;
/** Owner + injected + framework standard props for the settings section entry. */
export interface McpSettingsSectionProps {
    /** Close the settings panel (shell-owned affordance). */
    close: () => void;
    /** Injected `remote.mcp` handle. */
    mcp: McpRemote;
    /** Framework-injected translate seat (namespace `dsh-small-mcp-server`). */
    t: PanelTranslate;
}
export declare function McpSettingsSection({ mcp, t }: McpSettingsSectionProps): import("react").JSX.Element;
