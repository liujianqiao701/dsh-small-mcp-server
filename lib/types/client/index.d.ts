/**
 * Client plugin body: mounts the `mcp` remote namespace, registers the
 * `dsh-small-mcp-server` locale dictionaries, then registers the MCP settings page into
 * the `settings.section` slot.
 *
 * @module dsh-small-mcp-server
 */
import { type McpLocaleKey } from "./locales.js";
/** Services required before this plugin mounts. */
export declare const inject: string[];
/**
 * Browser plugin context as injected by the client module loader
 * (`dsh-client-modules`). Carries the `slots`, `remote`, `locale`,
 * `effect`, and `get` seats this plugin uses.
 */
export interface ClientContext {
    slots: {
        inject(name: string, factory: () => unknown): void;
        register(opts: unknown, Component: unknown): unknown;
    };
    remote: {
        $mount(remote: unknown): Promise<void>;
    };
    locale: {
        register(namespace: string, dict: Record<string, unknown>): void;
        bind(namespace: string): (key: McpLocaleKey) => string;
    };
    effect(cb: () => void, name?: string): () => void;
    get(key: string): unknown;
}
/** Mount the browser half. */
export declare function apply(ctx: ClientContext): Promise<void>;
