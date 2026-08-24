export function parseContentSecurityPolicySources(value) {
  return new Set(String(value).split(/[;\s]+/).filter(Boolean));
}
