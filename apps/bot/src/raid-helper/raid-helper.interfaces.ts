/** The raid-helper HTTP API, as the bot calls it. */
export interface RaidHelperApi {
  /**
   * GET /events/{eventId}: the JSON body, whatever the HTTP status (an unknown
   * event comes back as a 404 with a JSON failure body).
   */
  getEvent(eventId: string): Promise<unknown>;
}
