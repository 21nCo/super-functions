# @devfn/proxy

Maintains one lock-protected Caddy route registry. Generated configurations contain explicit `.localhost` routes only, are validated before reload, and never include a catch-all that could route an unknown hostname to the wrong project.
