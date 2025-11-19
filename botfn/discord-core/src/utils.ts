/**
 * Update a Discord interaction response
 */
export async function updateInteractionResponse(
  clientId: string,
  interactionToken: string,
  content: string
): Promise<void> {
  const response = await fetch(
    `https://discord.com/api/v10/webhooks/${clientId}/${interactionToken}/messages/@original`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to update Discord interaction response: ${response.status}`);
  }
}

/**
 * Extract options from Discord interaction data
 */
export function getInteractionOption<T = string>(
  options: Array<{ name: string; value: any }> | undefined,
  name: string
): T | undefined {
  return options?.find((opt) => opt.name === name)?.value as T | undefined;
}
