# @devfn/proxy

Maintains one lock-protected, DevFn-owned Caddy route registry. Generated configurations contain concrete `.localhost` routes and loopback targets only, are validated before reload, and never include a catch-all. If another Caddy owns the admin endpoint, DevFn refuses to replace its configuration.
