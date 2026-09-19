// Generated discovery data; plain modules support the declared Node range.
export default {
  "source": "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
  "sourceSha256": "f7eeb6b15b41b9fde5823982671748a8b4fcf80ab52d754644cb4ad9f7a31f8f",
  "revision": "20260826",
  "rootUrl": "https://www.googleapis.com/",
  "servicePath": "calendar/v3/",
  "methods": {
    "calendarList.list": {
      "scopes": [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.calendarlist",
        "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        "https://www.googleapis.com/auth/calendar.readonly"
      ],
      "supportsSubscription": true,
      "httpMethod": "GET",
      "id": "calendar.calendarList.list",
      "description": "Returns the calendars on the user's calendar list.",
      "parameters": {
        "minAccessRole": {
          "location": "query",
          "enum": [
            "freeBusyReader",
            "owner",
            "reader",
            "writer",
            "writerWithoutPrivateAccess"
          ],
          "description": "The minimum access role for the user in the returned entries. Optional. The default is no restriction.",
          "enumDescriptions": [
            "The user can read free/busy information.",
            "The user can read and modify events and access control lists.",
            "The user can read events that are not private.",
            "The user can read and modify events.",
            "The user can read and modify events that aren't private. The user can read free/busy information about private events. The user can't modify private events."
          ],
          "type": "string"
        },
        "showHidden": {
          "description": "Whether to show hidden entries. Optional. The default is False.",
          "type": "boolean",
          "location": "query"
        },
        "showDeleted": {
          "location": "query",
          "description": "Whether to include deleted calendar list entries in the result. Optional. The default is False.",
          "type": "boolean"
        },
        "syncToken": {
          "type": "string",
          "location": "query",
          "description": "Token obtained from the nextSyncToken field returned on the last page of results from the previous list request. It makes the result of this list request contain only entries that have changed since then. If only read-only fields such as calendar properties or ACLs have changed, the entry won't be returned. All entries deleted and hidden since the previous list request will always be in the result set and it is not allowed to set showDeleted neither showHidden to False.\nTo ensure client state consistency minAccessRole and showOwnOrganizationOnly query parameters cannot be specified together with nextSyncToken.\nIf the syncToken expires, the server will respond with a 410 GONE response code and the client should clear its storage and perform a full synchronization without any syncToken.\nLearn more about incremental synchronization.\nOptional. The default is to return all entries."
        },
        "showOwnOrganizationOnly": {
          "location": "query",
          "description": "Whether to show only entries for calendars from the organization. This parameter is only applicable to Google Workspace users. Optional. The default is False.",
          "type": "boolean"
        },
        "maxResults": {
          "location": "query",
          "description": "Maximum number of entries returned on one result page. By default the value is 100 entries. The page size can never be larger than 250 entries. Optional.",
          "type": "integer",
          "minimum": "1",
          "format": "int32"
        },
        "pageToken": {
          "description": "Token specifying which result page to return. Optional.",
          "type": "string",
          "location": "query"
        }
      },
      "path": "users/me/calendarList",
      "response": {
        "$ref": "CalendarList"
      }
    },
    "events.list": {
      "response": {
        "$ref": "Events"
      },
      "parameterOrder": [
        "calendarId"
      ],
      "description": "Returns events on the specified calendar.",
      "path": "calendars/{calendarId}/events",
      "parameters": {
        "syncToken": {
          "location": "query",
          "type": "string",
          "description": "Token obtained from the nextSyncToken field returned on the last page of results from the previous list request. It makes the result of this list request contain only entries that have changed since then. All events deleted since the previous list request will always be in the result set and it is not allowed to set showDeleted to False.\nThere are several query parameters that cannot be specified together with nextSyncToken to ensure consistency of the client state.\n\nThese are: \n- iCalUID \n- orderBy \n- privateExtendedProperty \n- q \n- sharedExtendedProperty \n- timeMin \n- timeMax \n- updatedMin All other query parameters should be the same as for the initial synchronization to avoid undefined behavior. If the syncToken expires, the server will respond with a 410 GONE response code and the client should clear its storage and perform a full synchronization without any syncToken.\nLearn more about incremental synchronization.\nOptional. The default is to return all entries."
        },
        "calendarId": {
          "required": true,
          "location": "path",
          "description": "Calendar identifier. To retrieve calendar IDs call the calendarList.list method. If you want to access the primary calendar of the currently logged in user, use the \"primary\" keyword.",
          "type": "string"
        },
        "showDeleted": {
          "location": "query",
          "description": "Whether to include deleted events (with status equals \"cancelled\") in the result. Cancelled instances of recurring events (but not the underlying recurring event) will still be included if showDeleted and singleEvents are both False. If showDeleted and singleEvents are both True, only single instances of deleted events (but not the underlying recurring events) are returned. Optional. The default is False.",
          "type": "boolean"
        },
        "privateExtendedProperty": {
          "type": "string",
          "repeated": true,
          "description": "Extended properties constraint specified as propertyName=value. Matches only private properties. This parameter might be repeated multiple times to return events that match all given constraints.",
          "location": "query"
        },
        "timeZone": {
          "type": "string",
          "location": "query",
          "description": "Time zone used in the response. Optional. The default is the time zone of the calendar."
        },
        "showHiddenInvitations": {
          "type": "boolean",
          "location": "query",
          "description": "Whether to include hidden invitations in the result. Optional. The default is False."
        },
        "orderBy": {
          "description": "The order of the events returned in the result. Optional. The default is an unspecified, stable order.",
          "location": "query",
          "enumDescriptions": [
            "Order by the start date/time (ascending). This is only available when querying single events (i.e. the parameter singleEvents is True)",
            "Order by last modification time (ascending)."
          ],
          "type": "string",
          "enum": [
            "startTime",
            "updated"
          ]
        },
        "q": {
          "type": "string",
          "location": "query",
          "description": "Free text search terms to find events that match these terms in the following fields:\n\n- summary \n- description \n- location \n- attendee's displayName \n- attendee's email \n- organizer's displayName \n- organizer's email \n- workingLocationProperties.officeLocation.buildingId \n- workingLocationProperties.officeLocation.deskId \n- workingLocationProperties.officeLocation.label \n- workingLocationProperties.customLocation.label \nThese search terms also match predefined keywords against all display title translations of working location, out-of-office, and focus-time events. For example, searching for \"Office\" or \"Bureau\" returns working location events of type officeLocation, whereas searching for \"Out of office\" or \"Abwesend\" returns out-of-office events. Optional."
        },
        "updatedMin": {
          "type": "string",
          "description": "Lower bound for an event's last modification time (as a RFC3339 timestamp) to filter by. When specified, entries deleted since this time will always be included regardless of showDeleted. Optional. The default is not to filter by last modification time.",
          "format": "date-time",
          "location": "query"
        },
        "alwaysIncludeEmail": {
          "type": "boolean",
          "location": "query",
          "description": "Deprecated and ignored."
        },
        "eventTypes": {
          "enumDescriptions": [
            "Special all-day events with an annual recurrence.",
            "Regular events.",
            "Focus time events.",
            "Events from Gmail.",
            "Out of office events.",
            "Working location events."
          ],
          "location": "query",
          "repeated": true,
          "enum": [
            "birthday",
            "default",
            "focusTime",
            "fromGmail",
            "outOfOffice",
            "workingLocation"
          ],
          "description": "Event types to return. Optional. This parameter can be repeated multiple times to return events of different types. If unset, returns all event types.",
          "type": "string"
        },
        "pageToken": {
          "type": "string",
          "description": "Token specifying which result page to return. Optional.",
          "location": "query"
        },
        "singleEvents": {
          "location": "query",
          "type": "boolean",
          "description": "Whether to expand recurring events into instances and only return single one-off events and instances of recurring events, but not the underlying recurring events themselves. Optional. The default is False."
        },
        "iCalUID": {
          "description": "Specifies an event ID in the iCalendar format to be provided in the response. Optional. Use this if you want to search for an event by its iCalendar ID.",
          "location": "query",
          "type": "string"
        },
        "timeMin": {
          "description": "Lower bound (exclusive) for an event's end time to filter by. Optional. The default is not to filter by end time. Must be an RFC3339 timestamp with mandatory time zone offset, for example, 2011-06-03T10:00:00-07:00, 2011-06-03T10:00:00Z. Milliseconds may be provided but are ignored. If timeMax is set, timeMin must be smaller than timeMax.",
          "format": "date-time",
          "location": "query",
          "type": "string"
        },
        "maxAttendees": {
          "minimum": "1",
          "location": "query",
          "format": "int32",
          "description": "The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional.",
          "type": "integer"
        },
        "timeMax": {
          "description": "Upper bound (exclusive) for an event's start time to filter by. Optional. The default is not to filter by start time. Must be an RFC3339 timestamp with mandatory time zone offset, for example, 2011-06-03T10:00:00-07:00, 2011-06-03T10:00:00Z. Milliseconds may be provided but are ignored. If timeMin is set, timeMax must be greater than timeMin.",
          "type": "string",
          "format": "date-time",
          "location": "query"
        },
        "maxResults": {
          "location": "query",
          "description": "Maximum number of events returned on one result page. The number of events in the resulting page may be less than this value, or none at all, even if there are more events matching the query. Incomplete pages can be detected by a non-empty nextPageToken field in the response. By default the value is 250 events. The page size can never be larger than 2500 events. Optional.",
          "type": "integer",
          "format": "int32",
          "minimum": "1",
          "default": "250"
        },
        "sharedExtendedProperty": {
          "repeated": true,
          "type": "string",
          "location": "query",
          "description": "Extended properties constraint specified as propertyName=value. Matches only shared properties. This parameter might be repeated multiple times to return events that match all given constraints."
        }
      },
      "id": "calendar.events.list",
      "scopes": [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.app.created",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.events.freebusy",
        "https://www.googleapis.com/auth/calendar.events.owned",
        "https://www.googleapis.com/auth/calendar.events.owned.readonly",
        "https://www.googleapis.com/auth/calendar.events.public.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
        "https://www.googleapis.com/auth/calendar.readonly"
      ],
      "httpMethod": "GET",
      "supportsSubscription": true
    },
    "events.get": {
      "description": "Returns an event based on its Google Calendar ID. To retrieve an event using its iCalendar ID, call the events.list method using the iCalUID parameter.",
      "path": "calendars/{calendarId}/events/{eventId}",
      "parameters": {
        "alwaysIncludeEmail": {
          "description": "Deprecated and ignored. A value will always be returned in the email field for the organizer, creator and attendees, even if no real email address is available (i.e. a generated, non-working value will be provided).",
          "type": "boolean",
          "location": "query"
        },
        "calendarId": {
          "type": "string",
          "description": "Calendar identifier. To retrieve calendar IDs call the calendarList.list method. If you want to access the primary calendar of the currently logged in user, use the \"primary\" keyword.",
          "required": true,
          "location": "path"
        },
        "maxAttendees": {
          "description": "The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional.",
          "format": "int32",
          "location": "query",
          "minimum": "1",
          "type": "integer"
        },
        "timeZone": {
          "description": "Time zone used in the response. Optional. The default is the time zone of the calendar.",
          "location": "query",
          "type": "string"
        },
        "eventId": {
          "description": "Event identifier.",
          "required": true,
          "location": "path",
          "type": "string"
        }
      },
      "scopes": [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.app.created",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.events.freebusy",
        "https://www.googleapis.com/auth/calendar.events.owned",
        "https://www.googleapis.com/auth/calendar.events.owned.readonly",
        "https://www.googleapis.com/auth/calendar.events.public.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
        "https://www.googleapis.com/auth/calendar.readonly"
      ],
      "response": {
        "$ref": "Event"
      },
      "parameterOrder": [
        "calendarId",
        "eventId"
      ],
      "id": "calendar.events.get",
      "httpMethod": "GET"
    },
    "events.insert": {
      "path": "calendars/{calendarId}/events",
      "description": "Creates an event.",
      "parameterOrder": [
        "calendarId"
      ],
      "response": {
        "$ref": "Event"
      },
      "id": "calendar.events.insert",
      "request": {
        "$ref": "Event"
      },
      "scopes": [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.app.created",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.events.owned"
      ],
      "httpMethod": "POST",
      "parameters": {
        "sendUpdates": {
          "location": "query",
          "enum": [
            "all",
            "externalOnly",
            "none"
          ],
          "enumDescriptions": [
            "Notifications are sent to all guests.",
            "Notifications are sent to non-Google Calendar guests only.",
            "No notifications are sent. Warning: Using the value none can have significant adverse effects, including events not syncing to external calendars or events being lost altogether for some users. For calendar migration tasks, consider using the events.import method instead."
          ],
          "type": "string",
          "description": "Whether to send notifications about the creation of the new event. Note that some emails might still be sent. The default is false."
        },
        "calendarId": {
          "description": "Calendar identifier. To retrieve calendar IDs call the calendarList.list method. If you want to access the primary calendar of the currently logged in user, use the \"primary\" keyword.",
          "required": true,
          "location": "path",
          "type": "string"
        },
        "conferenceDataVersion": {
          "location": "query",
          "maximum": "1",
          "format": "int32",
          "description": "Version number of conference data supported by the API client. Version 0 assumes no conference data support and ignores conference data in the event's body. Version 1 enables support for copying of ConferenceData as well as for creating new conferences using the createRequest field of conferenceData. The default is 0.",
          "minimum": "0",
          "type": "integer"
        },
        "supportsAttachments": {
          "location": "query",
          "description": "Whether API client performing operation supports event attachments. Optional. The default is False.",
          "type": "boolean"
        },
        "eventLabelVersion": {
          "format": "int32",
          "location": "query",
          "maximum": "1",
          "minimum": "0",
          "description": "Version number of the event label feature supported by the API client. Version 0 assumes no event label support and processes the colorId field for color management. Version 1 enables support for event labels, and processes the eventLabelId in the event's body. In this case, the colorId field is ignored. The default is 0.",
          "type": "integer"
        },
        "sendNotifications": {
          "description": "Deprecated. Please use sendUpdates instead.\n\nWhether to send notifications about the creation of the new event. Note that some emails might still be sent even if you set the value to false. The default is false.",
          "type": "boolean",
          "location": "query"
        },
        "maxAttendees": {
          "type": "integer",
          "minimum": "1",
          "description": "The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional.",
          "location": "query",
          "format": "int32"
        }
      }
    },
    "events.update": {
      "parameterOrder": [
        "calendarId",
        "eventId"
      ],
      "parameters": {
        "eventLabelVersion": {
          "format": "int32",
          "type": "integer",
          "maximum": "1",
          "location": "query",
          "minimum": "0",
          "description": "Version number of the event label feature supported by the API client. Version 0 assumes no event label support and processes the colorId field for color management. Version 1 enables support for event labels, and processes the eventLabelId in the event's body. In this case, the colorId field is ignored. The default is 0."
        },
        "sendUpdates": {
          "enumDescriptions": [
            "Notifications are sent to all guests.",
            "Notifications are sent to non-Google Calendar guests only.",
            "No notifications are sent. For calendar migration tasks, consider using the Events.import method instead."
          ],
          "description": "Guests who should receive notifications about the event update (for example, title changes, etc.).",
          "location": "query",
          "enum": [
            "all",
            "externalOnly",
            "none"
          ],
          "type": "string"
        },
        "supportsAttachments": {
          "type": "boolean",
          "location": "query",
          "description": "Whether API client performing operation supports event attachments. Optional. The default is False."
        },
        "calendarId": {
          "type": "string",
          "required": true,
          "location": "path",
          "description": "Calendar identifier. To retrieve calendar IDs call the calendarList.list method. If you want to access the primary calendar of the currently logged in user, use the \"primary\" keyword."
        },
        "conferenceDataVersion": {
          "format": "int32",
          "location": "query",
          "minimum": "0",
          "type": "integer",
          "description": "Version number of conference data supported by the API client. Version 0 assumes no conference data support and ignores conference data in the event's body. Version 1 enables support for copying of ConferenceData as well as for creating new conferences using the createRequest field of conferenceData. The default is 0.",
          "maximum": "1"
        },
        "eventId": {
          "description": "Event identifier.",
          "type": "string",
          "required": true,
          "location": "path"
        },
        "sendNotifications": {
          "location": "query",
          "type": "boolean",
          "description": "Deprecated. Please use sendUpdates instead.\n\nWhether to send notifications about the event update (for example, description changes, etc.). Note that some emails might still be sent even if you set the value to false. The default is false."
        },
        "maxAttendees": {
          "minimum": "1",
          "format": "int32",
          "location": "query",
          "description": "The maximum number of attendees to include in the response. If there are more than the specified number of attendees, only the participant is returned. Optional.",
          "type": "integer"
        },
        "alwaysIncludeEmail": {
          "description": "Deprecated and ignored. A value will always be returned in the email field for the organizer, creator and attendees, even if no real email address is available (i.e. a generated, non-working value will be provided).",
          "location": "query",
          "type": "boolean"
        }
      },
      "response": {
        "$ref": "Event"
      },
      "scopes": [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.app.created",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.events.owned"
      ],
      "httpMethod": "PUT",
      "description": "Updates an event.",
      "id": "calendar.events.update",
      "path": "calendars/{calendarId}/events/{eventId}",
      "request": {
        "$ref": "Event"
      }
    },
    "events.delete": {
      "parameterOrder": [
        "calendarId",
        "eventId"
      ],
      "httpMethod": "DELETE",
      "description": "Deletes an event.",
      "id": "calendar.events.delete",
      "scopes": [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.app.created",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.events.owned"
      ],
      "parameters": {
        "sendNotifications": {
          "description": "Deprecated. Please use sendUpdates instead.\n\nWhether to send notifications about the deletion of the event. Note that some emails might still be sent even if you set the value to false. The default is false.",
          "location": "query",
          "type": "boolean"
        },
        "eventId": {
          "type": "string",
          "required": true,
          "location": "path",
          "description": "Event identifier."
        },
        "sendUpdates": {
          "enum": [
            "all",
            "externalOnly",
            "none"
          ],
          "enumDescriptions": [
            "Notifications are sent to all guests.",
            "Notifications are sent to non-Google Calendar guests only.",
            "No notifications are sent. For calendar migration tasks, consider using the Events.import method instead."
          ],
          "type": "string",
          "location": "query",
          "description": "Guests who should receive notifications about the deletion of the event."
        },
        "calendarId": {
          "type": "string",
          "description": "Calendar identifier. To retrieve calendar IDs call the calendarList.list method. If you want to access the primary calendar of the currently logged in user, use the \"primary\" keyword.",
          "required": true,
          "location": "path"
        }
      },
      "path": "calendars/{calendarId}/events/{eventId}"
    },
    "freebusy.query": {
      "description": "Returns free/busy information for a set of calendars.",
      "id": "calendar.freebusy.query",
      "request": {
        "$ref": "FreeBusyRequest"
      },
      "path": "freeBusy",
      "httpMethod": "POST",
      "response": {
        "$ref": "FreeBusyResponse"
      },
      "scopes": [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events.freebusy",
        "https://www.googleapis.com/auth/calendar.freebusy",
        "https://www.googleapis.com/auth/calendar.readonly"
      ]
    }
  },
  "schemas": {
    "FreeBusyRequest": {
      "type": "object",
      "id": "FreeBusyRequest",
      "properties": {
        "groupExpansionMax": {
          "type": "integer",
          "format": "int32",
          "description": "Maximal number of calendar identifiers to be provided for a single group. Optional. An error is returned for a group with more members than this value. Maximum value is 100."
        },
        "timeMax": {
          "format": "date-time",
          "description": "The end of the interval for the query formatted as per RFC3339.",
          "type": "string"
        },
        "items": {
          "description": "List of calendars and/or groups to query.",
          "type": "array",
          "items": {
            "$ref": "FreeBusyRequestItem"
          }
        },
        "timeMin": {
          "format": "date-time",
          "type": "string",
          "description": "The start of the interval for the query formatted as per RFC3339."
        },
        "calendarExpansionMax": {
          "type": "integer",
          "format": "int32",
          "description": "Maximal number of calendars for which FreeBusy information is to be provided. Optional. Maximum value is 50."
        },
        "timeZone": {
          "type": "string",
          "default": "UTC",
          "description": "Time zone used in the response. Optional. The default is UTC."
        }
      }
    },
    "Events": {
      "properties": {
        "nextPageToken": {
          "type": "string",
          "description": "Token used to access the next page of this result. Omitted if no further results are available, in which case nextSyncToken is provided."
        },
        "kind": {
          "description": "Type of the collection (\"calendar#events\").",
          "type": "string",
          "default": "calendar#events"
        },
        "updated": {
          "format": "date-time",
          "type": "string",
          "description": "Last modification time of the calendar (as a RFC3339 timestamp). Read-only."
        },
        "items": {
          "type": "array",
          "description": "List of events on the calendar.",
          "items": {
            "$ref": "Event"
          }
        },
        "description": {
          "type": "string",
          "description": "Description of the calendar. Read-only."
        },
        "accessRole": {
          "description": "The user's access role for this calendar. Read-only. Possible values are:  \n- \"none\" - The user has no access. \n- \"freeBusyReader\" - The user has read access to free/busy information. \n- \"reader\" - The user has read access to the calendar. Private events will appear to users with reader access, but event details will be hidden. \n- \"writerWithoutPrivateAccess\" - The user has read and write access to the calendar. Private events will appear to users with writerWithoutPrivateAccess access, but event details will be hidden. \n- \"writer\" - The user has read and write access to the calendar. Private events will appear to users with writer access, and event details will be visible. \n- \"owner\" - The user has manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to see and modify access levels of other users.\nImportant: the owner role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with owner role.",
          "type": "string"
        },
        "timeZone": {
          "description": "The time zone of the calendar. Read-only.",
          "type": "string"
        },
        "defaultReminders": {
          "type": "array",
          "description": "The default reminders on the calendar for the authenticated user. These reminders apply to all events on this calendar that do not explicitly override them (i.e. do not have reminders.useDefault set to True).",
          "items": {
            "$ref": "EventReminder"
          }
        },
        "summary": {
          "type": "string",
          "description": "Title of the calendar. Read-only."
        },
        "nextSyncToken": {
          "type": "string",
          "description": "Token used at a later point in time to retrieve only the entries that have changed since this result was returned. Omitted if further results are available, in which case nextPageToken is provided."
        },
        "etag": {
          "type": "string",
          "description": "ETag of the collection."
        }
      },
      "type": "object",
      "id": "Events"
    },
    "EventReminder": {
      "properties": {
        "method": {
          "description": "The method used by this reminder. Possible values are:  \n- \"email\" - Reminders are sent via email. \n- \"popup\" - Reminders are sent via a UI popup.  \nRequired when adding a reminder.",
          "type": "string"
        },
        "minutes": {
          "description": "Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes).\nRequired when adding a reminder.",
          "format": "int32",
          "type": "integer"
        }
      },
      "type": "object",
      "id": "EventReminder"
    },
    "FreeBusyRequestItem": {
      "id": "FreeBusyRequestItem",
      "type": "object",
      "properties": {
        "id": {
          "description": "The identifier of a calendar or a group.",
          "type": "string"
        }
      }
    },
    "CalendarList": {
      "properties": {
        "nextSyncToken": {
          "type": "string",
          "description": "Token used at a later point in time to retrieve only the entries that have changed since this result was returned. Omitted if further results are available, in which case nextPageToken is provided."
        },
        "etag": {
          "type": "string",
          "description": "ETag of the collection."
        },
        "nextPageToken": {
          "description": "Token used to access the next page of this result. Omitted if no further results are available, in which case nextSyncToken is provided.",
          "type": "string"
        },
        "kind": {
          "description": "Type of the collection (\"calendar#calendarList\").",
          "default": "calendar#calendarList",
          "type": "string"
        },
        "items": {
          "description": "Calendars that are present on the user's calendar list.",
          "type": "array",
          "items": {
            "$ref": "CalendarListEntry"
          }
        }
      },
      "id": "CalendarList",
      "type": "object"
    },
    "CalendarListEntry": {
      "id": "CalendarListEntry",
      "properties": {
        "dataOwner": {
          "type": "string",
          "description": "The email of the owner of the calendar. Set only for secondary calendars. Read-only."
        },
        "etag": {
          "description": "ETag of the resource.",
          "type": "string"
        },
        "summary": {
          "description": "Title of the calendar. Read-only.",
          "type": "string"
        },
        "notificationSettings": {
          "type": "object",
          "properties": {
            "notifications": {
              "description": "The list of notifications set for this calendar.",
              "items": {
                "$ref": "CalendarNotification"
              },
              "type": "array"
            }
          },
          "description": "The notifications that the authenticated user is receiving for this calendar."
        },
        "defaultReminders": {
          "description": "The default reminders that the authenticated user has for this calendar.",
          "items": {
            "$ref": "EventReminder"
          },
          "type": "array"
        },
        "summaryOverride": {
          "description": "The summary that the authenticated user has set for this calendar. Optional.",
          "type": "string"
        },
        "deleted": {
          "type": "boolean",
          "description": "Whether this calendar list entry has been deleted from the calendar list. Read-only. Optional. The default is False.",
          "default": "false"
        },
        "conferenceProperties": {
          "$ref": "ConferenceProperties",
          "description": "Conferencing properties for this calendar, for example what types of conferences are allowed."
        },
        "primary": {
          "default": "false",
          "description": "Whether the calendar is the primary calendar of the authenticated user. Read-only. Optional. The default is False.",
          "type": "boolean"
        },
        "colorId": {
          "type": "string",
          "description": "The color of the calendar. This is an ID referring to an entry in the calendar section of the colors definition (see the colors endpoint). This property is superseded by the backgroundColor and foregroundColor properties and can be ignored when using these properties. Optional."
        },
        "backgroundColor": {
          "type": "string",
          "description": "The main color of the calendar in the hexadecimal format \"#0088aa\". This property supersedes the index-based colorId property. To set or change this property, you need to specify colorRgbFormat=true in the parameters of the insert, update and patch methods. Optional."
        },
        "id": {
          "description": "Identifier of the calendar.",
          "annotations": {
            "required": [
              "calendar.calendarList.insert"
            ]
          },
          "type": "string"
        },
        "hidden": {
          "type": "boolean",
          "description": "Whether the calendar has been hidden from the list. Optional. The attribute is only returned when the calendar is hidden, in which case the value is true.",
          "default": "false"
        },
        "location": {
          "type": "string",
          "description": "Geographic location of the calendar as free-form text. Optional. Read-only."
        },
        "accessRole": {
          "type": "string",
          "description": "The effective access role that the authenticated user has on the calendar. Read-only. Possible values are:  \n- \"freeBusyReader\" - Provides read access to free/busy information. \n- \"reader\" - Provides read access to the calendar. Private events will appear to users with reader access, but event details will be hidden. \n- \"writerWithoutPrivateAccess\" - Provides read and write access to the calendar. Private events will appear to users with writerWithoutPrivateAccess access, but event details will be hidden. \n- \"writer\" - Provides read and write access to the calendar. Private events will appear to users with writer access, and event details will be visible. \n- \"owner\" - Provides manager access to the calendar. This role has all of the permissions of the writer role with the additional ability to see and modify access levels of other users.\nImportant: the owner role is different from the calendar's data owner. A calendar has a single data owner, but can have multiple users with owner role."
        },
        "timeZone": {
          "description": "The time zone of the calendar. Optional. Read-only.",
          "type": "string"
        },
        "foregroundColor": {
          "type": "string",
          "description": "The foreground color of the calendar in the hexadecimal format \"#ffffff\". This property supersedes the index-based colorId property. To set or change this property, you need to specify colorRgbFormat=true in the parameters of the insert, update and patch methods. Optional."
        },
        "autoAcceptInvitations": {
          "type": "boolean",
          "description": "Whether this calendar automatically accepts invitations. Only valid for resource calendars. Read-only."
        },
        "description": {
          "description": "Description of the calendar. Optional. Read-only.",
          "type": "string"
        },
        "selected": {
          "description": "Whether the calendar content shows up in the calendar UI. Optional. The default is False.",
          "default": "false",
          "type": "boolean"
        },
        "kind": {
          "type": "string",
          "default": "calendar#calendarListEntry",
          "description": "Type of the resource (\"calendar#calendarListEntry\")."
        }
      },
      "type": "object"
    },
    "ConferenceProperties": {
      "properties": {
        "allowedConferenceSolutionTypes": {
          "description": "The types of conference solutions that are supported for this calendar.\nThe possible values are:  \n- \"eventHangout\" \n- \"eventNamedHangout\" \n- \"hangoutsMeet\"  Optional.",
          "items": {
            "type": "string"
          },
          "type": "array"
        }
      },
      "id": "ConferenceProperties",
      "type": "object"
    },
    "FreeBusyResponse": {
      "id": "FreeBusyResponse",
      "properties": {
        "kind": {
          "description": "Type of the resource (\"calendar#freeBusy\").",
          "type": "string",
          "default": "calendar#freeBusy"
        },
        "groups": {
          "additionalProperties": {
            "$ref": "FreeBusyGroup",
            "description": "List of calendars that are members of this group."
          },
          "description": "Expansion of groups.",
          "type": "object"
        },
        "calendars": {
          "description": "List of free/busy information for calendars.",
          "type": "object",
          "additionalProperties": {
            "description": "Free/busy expansions for a single calendar.",
            "$ref": "FreeBusyCalendar"
          }
        },
        "timeMin": {
          "type": "string",
          "format": "date-time",
          "description": "The start of the interval."
        },
        "timeMax": {
          "type": "string",
          "format": "date-time",
          "description": "The end of the interval."
        }
      },
      "type": "object"
    },
    "FreeBusyGroup": {
      "type": "object",
      "properties": {
        "calendars": {
          "type": "array",
          "description": "List of calendars' identifiers within a group.",
          "items": {
            "type": "string"
          }
        },
        "errors": {
          "description": "Optional error(s) (if computation for the group failed).",
          "type": "array",
          "items": {
            "$ref": "Error"
          }
        }
      },
      "id": "FreeBusyGroup"
    },
    "Error": {
      "type": "object",
      "id": "Error",
      "properties": {
        "domain": {
          "description": "Domain, or broad category, of the error.",
          "type": "string"
        },
        "reason": {
          "type": "string",
          "description": "Specific reason for the error. Some of the possible values are:  \n- \"groupTooBig\" - The group of users requested is too large for a single query. \n- \"tooManyCalendarsRequested\" - The number of calendars requested is too large for a single query. \n- \"notFound\" - The requested resource was not found. \n- \"internalError\" - The API service has encountered an internal error.  Additional error types may be added in the future, so clients should gracefully handle additional error statuses not included in this list."
        }
      }
    },
    "FreeBusyCalendar": {
      "type": "object",
      "id": "FreeBusyCalendar",
      "properties": {
        "busy": {
          "items": {
            "$ref": "TimePeriod"
          },
          "description": "List of time ranges during which this calendar should be regarded as busy.",
          "type": "array"
        },
        "errors": {
          "type": "array",
          "description": "Optional error(s) (if computation for the calendar failed).",
          "items": {
            "$ref": "Error"
          }
        }
      }
    },
    "TimePeriod": {
      "id": "TimePeriod",
      "properties": {
        "end": {
          "type": "string",
          "format": "date-time",
          "description": "The (exclusive) end of the time period."
        },
        "start": {
          "format": "date-time",
          "type": "string",
          "description": "The (inclusive) start of the time period."
        }
      },
      "type": "object"
    },
    "CalendarNotification": {
      "id": "CalendarNotification",
      "properties": {
        "method": {
          "type": "string",
          "description": "The method used to deliver the notification. The possible value is:  \n- \"email\" - Notifications are sent via email.  \nRequired when adding a notification."
        },
        "type": {
          "type": "string",
          "description": "The type of notification. Possible values are:  \n- \"eventCreation\" - Notification sent when a new event is put on the calendar. \n- \"eventChange\" - Notification sent when an event is changed. \n- \"eventCancellation\" - Notification sent when an event is cancelled. \n- \"eventResponse\" - Notification sent when an attendee responds to the event invitation. \n- \"agenda\" - An agenda with the events of the day (sent out in the morning).  \nRequired when adding a notification."
        }
      },
      "type": "object"
    },
    "Event": {
      "properties": {
        "htmlLink": {
          "type": "string",
          "description": "An absolute link to this event in the Google Calendar Web UI. Read-only."
        },
        "transparency": {
          "default": "opaque",
          "description": "Whether the event blocks time on the calendar. Optional. Possible values are:  \n- \"opaque\" - Default value. The event does block time on the calendar. This is equivalent to setting Show me as to Busy in the Calendar UI. \n- \"transparent\" - The event does not block time on the calendar. This is equivalent to setting Show me as to Available in the Calendar UI.",
          "type": "string"
        },
        "locked": {
          "type": "boolean",
          "default": "false",
          "description": "Whether this is a locked event copy where no changes can be made to the main event fields \"summary\", \"description\", \"location\", \"start\", \"end\" or \"recurrence\". The default is False. Read-Only."
        },
        "description": {
          "type": "string",
          "description": "Description of the event. Can contain HTML. Optional."
        },
        "conferenceData": {
          "$ref": "ConferenceData",
          "description": "The conference-related information, such as details of a Google Meet conference. To create new conference details use the createRequest field. To persist your changes, remember to set the conferenceDataVersion request parameter to 1 for all event modification requests. Warning: Reusing Google Meet conference data across different events can cause access issues and expose meeting details to unintended users. To help ensure meeting privacy, always generate a unique conference for each event by using the createRequest field."
        },
        "recurringEventId": {
          "type": "string",
          "description": "For an instance of a recurring event, this is the id of the recurring event to which this instance belongs. Immutable."
        },
        "reminders": {
          "properties": {
            "overrides": {
              "type": "array",
              "description": "If the event doesn't use the default reminders, this lists the reminders specific to the event, or, if not set, indicates that no reminders are set for this event. The maximum number of override reminders is 5.",
              "items": {
                "$ref": "EventReminder"
              }
            },
            "useDefault": {
              "type": "boolean",
              "description": "Whether the default reminders of the calendar apply to the event."
            }
          },
          "description": "Information about the event's reminders for the authenticated user. Note that changing reminders does not also change the updated property of the enclosing event.",
          "type": "object"
        },
        "hangoutLink": {
          "description": "An absolute link to the Google Hangout associated with this event. Read-only.",
          "type": "string"
        },
        "sequence": {
          "type": "integer",
          "description": "Sequence number as per iCalendar.",
          "format": "int32"
        },
        "gadget": {
          "description": "A gadget that extends this event. Gadgets are deprecated; this structure is instead only used for returning birthday calendar metadata.",
          "type": "object",
          "properties": {
            "title": {
              "type": "string",
              "description": "The gadget's title. Deprecated."
            },
            "link": {
              "description": "The gadget's URL. The URL scheme must be HTTPS. Deprecated.",
              "type": "string"
            },
            "height": {
              "description": "The gadget's height in pixels. The height must be an integer greater than 0. Optional. Deprecated.",
              "format": "int32",
              "type": "integer"
            },
            "display": {
              "description": "The gadget's display mode. Deprecated. Possible values are:  \n- \"icon\" - The gadget displays next to the event's title in the calendar view. \n- \"chip\" - The gadget displays when the event is clicked.",
              "type": "string"
            },
            "width": {
              "type": "integer",
              "format": "int32",
              "description": "The gadget's width in pixels. The width must be an integer greater than 0. Optional. Deprecated."
            },
            "type": {
              "type": "string",
              "description": "The gadget's type. Deprecated."
            },
            "iconLink": {
              "type": "string",
              "description": "The gadget's icon URL. The URL scheme must be HTTPS. Deprecated."
            },
            "preferences": {
              "description": "Preferences.",
              "additionalProperties": {
                "description": "The preference name and corresponding value.",
                "type": "string"
              },
              "type": "object"
            }
          }
        },
        "visibility": {
          "default": "default",
          "type": "string",
          "description": "Visibility of the event. Optional. Possible values are:  \n- \"default\" - Uses the default visibility for events on the calendar. This is the default value. \n- \"public\" - The event is public and event details are visible to all readers of the calendar. \n- \"private\" - The event is private and only event attendees may view event details. \n- \"confidential\" - The event is private. This value is provided for compatibility reasons.  \nNote on recurring events: Changing the visibility of a single instance of a recurring event can affect all instances of the series. If the new setting is more restrictive (e.g. from public to private), it is applied to all instances. If the new setting is less restrictive (e.g. from private to public), the change is ignored. To make a recurring event less restrictive, you must update the parent recurring event."
        },
        "summary": {
          "description": "Title of the event.",
          "type": "string"
        },
        "etag": {
          "description": "ETag of the resource.",
          "type": "string"
        },
        "attachments": {
          "items": {
            "$ref": "EventAttachment"
          },
          "description": "File attachments for the event.\nIn order to modify attachments the supportsAttachments request parameter should be set to true.\nThere can be at most 25 attachments per event,",
          "type": "array"
        },
        "organizer": {
          "properties": {
            "self": {
              "description": "Whether the organizer corresponds to the calendar on which this copy of the event appears. Read-only. The default is False.",
              "default": "false",
              "type": "boolean"
            },
            "id": {
              "type": "string",
              "description": "The organizer's Profile ID, if available."
            },
            "email": {
              "description": "The organizer's email address, if available. It must be a valid email address as per RFC5322.",
              "type": "string"
            },
            "displayName": {
              "type": "string",
              "description": "The organizer's name, if available."
            }
          },
          "description": "The organizer of the event. If the organizer is also an attendee, this is indicated with a separate entry in attendees with the organizer field set to True. To change the organizer, use the move operation. Read-only, except when importing an event.",
          "type": "object"
        },
        "location": {
          "type": "string",
          "description": "Geographic location of the event as free-form text. Optional."
        },
        "status": {
          "description": "Status of the event. Optional. Possible values are:  \n- \"confirmed\" - The event is confirmed. This is the default status. \n- \"tentative\" - The event is tentatively confirmed. \n- \"cancelled\" - The event is cancelled (deleted). The list method returns cancelled events only on incremental sync (when syncToken or updatedMin are specified) or if the showDeleted flag is set to true. The get method always returns them.\nA cancelled status represents two different states depending on the event type:  \n- Cancelled exceptions of an uncancelled recurring event indicate that this instance should no longer be presented to the user. Clients should store these events for the lifetime of the parent recurring event.\nCancelled exceptions are only guaranteed to have values for the id, recurringEventId and originalStartTime fields populated. The other fields might be empty.  \n- All other cancelled events represent deleted events. Clients should remove their locally synced copies. Such cancelled events will eventually disappear, so do not rely on them being available indefinitely.\nDeleted events are only guaranteed to have the id field populated.   On the organizer's calendar, cancelled events continue to expose event details (summary, location, etc.) so that they can be restored (undeleted). Similarly, the events to which the user was invited and that they manually removed continue to provide details. However, incremental sync requests with showDeleted set to false will not return these details.\nIf an event changes its organizer (for example via the move operation) and the original organizer is not on the attendee list, it will leave behind a cancelled event where only the id field is guaranteed to be populated.",
          "type": "string"
        },
        "privateCopy": {
          "type": "boolean",
          "default": "false",
          "description": "If set to True, Event propagation is disabled. Note that it is not the same thing as Private event properties. Optional. Immutable. The default is False."
        },
        "focusTimeProperties": {
          "$ref": "EventFocusTimeProperties",
          "description": "Focus Time event data. Used if eventType is focusTime."
        },
        "updated": {
          "format": "date-time",
          "type": "string",
          "description": "Last modification time of the main event data (as a RFC3339 timestamp). Updating event reminders will not cause this to change. Read-only."
        },
        "birthdayProperties": {
          "description": "Birthday or special event data. Used if eventType is \"birthday\". Immutable.",
          "$ref": "EventBirthdayProperties"
        },
        "id": {
          "type": "string",
          "description": "Opaque identifier of the event. When creating new single or recurring events, you can specify their IDs. Provided IDs must follow these rules:  \n- characters allowed in the ID are those used in base32hex encoding, i.e. lowercase letters a-v and digits 0-9, see section 3.1.2 in RFC2938 \n- the length of the ID must be between 5 and 1024 characters \n- the ID must be unique per calendar  Due to the globally distributed nature of the system, we cannot guarantee that ID collisions will be detected at event creation time. To minimize the risk of collisions we recommend using an established UUID algorithm such as one described in RFC4122.\nIf you do not specify an ID, it will be automatically generated by the server.\nNote that the icalUID and the id are not identical and only one of them should be supplied at event creation time. One difference in their semantics is that in recurring events, all occurrences of one event have different ids while they all share the same icalUIDs."
        },
        "created": {
          "type": "string",
          "format": "date-time",
          "description": "Creation time of the event (as a RFC3339 timestamp). Read-only."
        },
        "guestsCanModify": {
          "type": "boolean",
          "default": "false",
          "description": "Whether attendees other than the organizer can modify the event. Optional. The default is False."
        },
        "attendees": {
          "description": "The attendees of the event. See the Events with attendees guide for more information on scheduling events with other calendar users. Service accounts need to use domain-wide delegation of authority to populate the attendee list.",
          "type": "array",
          "items": {
            "$ref": "EventAttendee"
          }
        },
        "iCalUID": {
          "description": "Event unique identifier as defined in RFC5545. It is used to uniquely identify events accross calendaring systems and must be supplied when importing events via the import method.\nNote that the iCalUID and the id are not identical and only one of them should be supplied at event creation time. One difference in their semantics is that in recurring events, all occurrences of one event have different ids while they all share the same iCalUIDs. To retrieve an event using its iCalUID, call the events.list method using the iCalUID parameter. To retrieve an event using its id, call the events.get method.",
          "annotations": {
            "required": [
              "calendar.events.import"
            ]
          },
          "type": "string"
        },
        "eventLabelId": {
          "type": "string",
          "description": "The ID of the event label assigned to the event. Optional. This refers to the ID of an entry in the labelProperties.eventLabels property of the calendar (see the Calendars.get endpoint.)\nThis property supersedes the index-based colorId property. To set or change this property, you need to specify eventLabelVersion=1 in the parameters of the insert, import, update, and patch methods.\nSetting an empty string, or not setting this field at all, will remove the existing label from the event."
        },
        "workingLocationProperties": {
          "$ref": "EventWorkingLocationProperties",
          "description": "Working location event data."
        },
        "outOfOfficeProperties": {
          "$ref": "EventOutOfOfficeProperties",
          "description": "Out of office event data. Used if eventType is outOfOffice."
        },
        "creator": {
          "type": "object",
          "description": "The creator of the event. Read-only.",
          "properties": {
            "email": {
              "type": "string",
              "description": "The creator's email address, if available."
            },
            "displayName": {
              "description": "The creator's name, if available.",
              "type": "string"
            },
            "self": {
              "type": "boolean",
              "description": "Whether the creator corresponds to the calendar on which this copy of the event appears. Read-only. The default is False.",
              "default": "false"
            },
            "id": {
              "type": "string",
              "description": "The creator's Profile ID, if available."
            }
          }
        },
        "recurrence": {
          "items": {
            "type": "string"
          },
          "description": "List of RRULE, EXRULE, RDATE and EXDATE lines for a recurring event, as specified in RFC5545. Note that DTSTART and DTEND lines are not allowed in this field; event start and end times are specified in the start and end fields. This field is omitted for single events or instances of recurring events.",
          "type": "array"
        },
        "guestsCanSeeOtherGuests": {
          "type": "boolean",
          "description": "Whether attendees other than the organizer can see who the event's attendees are. Optional. The default is True.",
          "default": "true"
        },
        "eventType": {
          "type": "string",
          "default": "default",
          "description": "Specific type of the event. This cannot be modified after the event is created. Possible values are:  \n- \"birthday\" - A special all-day event with an annual recurrence. \n- \"default\" - A regular event or not further specified. \n- \"focusTime\" - A focus-time event. \n- \"fromGmail\" - An event from Gmail. This type of event cannot be created. \n- \"outOfOffice\" - An out-of-office event. \n- \"workingLocation\" - A working location event."
        },
        "start": {
          "$ref": "EventDateTime",
          "description": "The (inclusive) start time of the event. For a recurring event, this is the start time of the first instance.",
          "annotations": {
            "required": [
              "calendar.events.import",
              "calendar.events.insert",
              "calendar.events.update"
            ]
          }
        },
        "guestsCanInviteOthers": {
          "type": "boolean",
          "description": "Whether attendees other than the organizer can invite others to the event. Optional. The default is True.",
          "default": "true"
        },
        "anyoneCanAddSelf": {
          "description": "Whether anyone can invite themselves to the event (deprecated). Optional. The default is False.",
          "type": "boolean",
          "default": "false"
        },
        "kind": {
          "type": "string",
          "description": "Type of the resource (\"calendar#event\").",
          "default": "calendar#event"
        },
        "source": {
          "description": "Source from which the event was created. For example, a web page, an email message or any document identifiable by an URL with HTTP or HTTPS scheme. Can only be seen or modified by the creator of the event.",
          "type": "object",
          "properties": {
            "url": {
              "description": "URL of the source pointing to a resource. The URL scheme must be HTTP or HTTPS.",
              "type": "string"
            },
            "title": {
              "type": "string",
              "description": "Title of the source; for example a title of a web page or an email subject."
            }
          }
        },
        "originalStartTime": {
          "description": "For an instance of a recurring event, this is the time at which this event would start according to the recurrence data in the recurring event identified by recurringEventId. It uniquely identifies the instance within the recurring event series even if the instance was moved to a different time. Immutable.",
          "$ref": "EventDateTime"
        },
        "attendeesOmitted": {
          "default": "false",
          "description": "Whether attendees may have been omitted from the event's representation. When retrieving an event, this may be due to a restriction specified by the maxAttendee query parameter. When updating an event, this can be used to only update the participant's response. Optional. The default is False.",
          "type": "boolean"
        },
        "end": {
          "description": "The (exclusive) end time of the event. For a recurring event, this is the end time of the first instance.",
          "annotations": {
            "required": [
              "calendar.events.import",
              "calendar.events.insert",
              "calendar.events.update"
            ]
          },
          "$ref": "EventDateTime"
        },
        "endTimeUnspecified": {
          "description": "Whether the end time is actually unspecified. An end time is still provided for compatibility reasons, even if this attribute is set to True. The default is False.",
          "default": "false",
          "type": "boolean"
        },
        "extendedProperties": {
          "description": "Extended properties of the event.",
          "type": "object",
          "properties": {
            "private": {
              "description": "Properties that are private to the copy of the event that appears on this calendar.",
              "type": "object",
              "additionalProperties": {
                "type": "string",
                "description": "The name of the private property and the corresponding value."
              }
            },
            "shared": {
              "type": "object",
              "description": "Properties that are shared between copies of the event on other attendees' calendars.",
              "additionalProperties": {
                "description": "The name of the shared property and the corresponding value.",
                "type": "string"
              }
            }
          }
        },
        "colorId": {
          "type": "string",
          "description": "The color of the event. This is an ID referring to an entry in the event section of the colors definition (see the  colors endpoint). Optional."
        }
      },
      "id": "Event",
      "type": "object"
    },
    "EventDateTime": {
      "type": "object",
      "id": "EventDateTime",
      "properties": {
        "date": {
          "type": "string",
          "format": "date",
          "description": "The date, in the format \"yyyy-mm-dd\", if this is an all-day event."
        },
        "dateTime": {
          "description": "The time, as a combined date-time value (formatted according to RFC3339). A time zone offset is required unless a time zone is explicitly specified in timeZone.",
          "type": "string",
          "format": "date-time"
        },
        "timeZone": {
          "description": "The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. \"Europe/Zurich\".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end.",
          "type": "string"
        }
      }
    },
    "EventAttendee": {
      "id": "EventAttendee",
      "type": "object",
      "properties": {
        "responseStatus": {
          "type": "string",
          "description": "The attendee's response status. Possible values are:  \n- \"needsAction\" - The attendee has not responded to the invitation (recommended for new events). \n- \"declined\" - The attendee has declined the invitation. \n- \"tentative\" - The attendee has tentatively accepted the invitation. \n- \"accepted\" - The attendee has accepted the invitation.  Warning: If you add an event using the values declined, tentative, or accepted, attendees with the \"Add invitations to my calendar\" setting set to \"When I respond to invitation in email\" or \"Only if the sender is known\" might have their response reset to needsAction and won't see an event in their calendar unless they change their response in the event invitation email. Furthermore, if more than 200 guests are invited to the event, response status is not propagated to the guests."
        },
        "resource": {
          "description": "Whether the attendee is a resource. Can only be set when the attendee is added to the event for the first time. Subsequent modifications are ignored. Optional. The default is False.",
          "default": "false",
          "type": "boolean"
        },
        "displayName": {
          "type": "string",
          "description": "The attendee's name, if available. Optional."
        },
        "self": {
          "default": "false",
          "description": "Whether this entry represents the calendar on which this copy of the event appears. Read-only. The default is False.",
          "type": "boolean"
        },
        "asyncOperation": {
          "default": "",
          "type": "string",
          "description": "If present, indicates the status of an asynchronous operation ongoing for this attendee (e.g. listing of members of large attendee groups). Read-only. The default is to not be present.\nPossible values are:  \n- \"inProgress\" - The asynchronous operation is in progress. \n- (not present) - Otherwise."
        },
        "organizer": {
          "type": "boolean",
          "description": "Whether the attendee is the organizer of the event. Read-only. The default is False."
        },
        "email": {
          "type": "string",
          "description": "The attendee's email address, if available. This field must be present when adding an attendee. It must be a valid email address as per RFC5322.\nRequired when adding an attendee."
        },
        "comment": {
          "description": "The attendee's response comment. Optional.",
          "type": "string"
        },
        "additionalGuests": {
          "type": "integer",
          "default": "0",
          "description": "Number of additional guests. Optional. The default is 0.",
          "format": "int32"
        },
        "optional": {
          "default": "false",
          "type": "boolean",
          "description": "Whether this is an optional attendee. Optional. The default is False."
        },
        "id": {
          "type": "string",
          "description": "The attendee's Profile ID, if available."
        }
      }
    },
    "EventFocusTimeProperties": {
      "id": "EventFocusTimeProperties",
      "properties": {
        "autoDeclineMode": {
          "description": "Whether to decline meeting invitations which overlap Focus Time events. Valid values are declineNone, meaning that no meeting invitations are declined; declineAllConflictingInvitations, meaning that all conflicting meeting invitations that conflict with the event are declined; and declineOnlyNewConflictingInvitations, meaning that only new conflicting meeting invitations which arrive while the Focus Time event is present are to be declined.",
          "type": "string"
        },
        "declineMessage": {
          "description": "Response message to set if an existing event or new invitation is automatically declined by Calendar.",
          "type": "string"
        },
        "chatStatus": {
          "type": "string",
          "description": "The status to mark the user in Chat and related products. This can be available or doNotDisturb."
        }
      },
      "type": "object"
    },
    "EventAttachment": {
      "properties": {
        "mimeType": {
          "description": "Internet media type (MIME type) of the attachment.",
          "type": "string"
        },
        "title": {
          "type": "string",
          "description": "Attachment title."
        },
        "fileUrl": {
          "type": "string",
          "description": "URL link to the attachment.\nFor adding Google Drive file attachments use the same format as in alternateLink property of the Files resource in the Drive API.\nRequired when adding an attachment."
        },
        "fileId": {
          "type": "string",
          "description": "ID of the attached file. Read-only.\nFor Google Drive files, this is the ID of the corresponding Files resource entry in the Drive API."
        },
        "iconLink": {
          "type": "string",
          "description": "URL link to the attachment's icon. This field can only be modified for custom third-party attachments."
        }
      },
      "id": "EventAttachment",
      "type": "object"
    },
    "EventBirthdayProperties": {
      "type": "object",
      "id": "EventBirthdayProperties",
      "properties": {
        "contact": {
          "type": "string",
          "description": "Resource name of the contact this birthday event is linked to. This can be used to fetch contact details from People API. Format: \"people/c12345\". Read-only."
        },
        "type": {
          "type": "string",
          "default": "birthday",
          "description": "Type of birthday or special event. Possible values are:  \n- \"anniversary\" - An anniversary other than birthday. Always has a contact. \n- \"birthday\" - A birthday event. This is the default value. \n- \"custom\" - A special date whose label is further specified in the customTypeName field. Always has a contact. \n- \"other\" - A special date which does not fall into the other categories, and does not have a custom label. Always has a contact. \n- \"self\" - Calendar owner's own birthday. Cannot have a contact.  The Calendar API only supports creating events with the type \"birthday\". The type cannot be changed after the event is created."
        },
        "customTypeName": {
          "type": "string",
          "description": "Custom type label specified for this event. This is populated if birthdayProperties.type is set to \"custom\". Read-only."
        }
      }
    },
    "ConferenceData": {
      "id": "ConferenceData",
      "properties": {
        "conferenceSolution": {
          "$ref": "ConferenceSolution",
          "description": "The conference solution, such as Google Meet.\nUnset for a conference with a failed create request.\nEither conferenceSolution and at least one entryPoint, or createRequest is required."
        },
        "signature": {
          "description": "The signature of the conference data.\nGenerated on server side.\nUnset for a conference with a failed create request.\nOptional for a conference with a pending create request.",
          "type": "string"
        },
        "notes": {
          "description": "Additional notes (such as instructions from the domain administrator, legal notices) to display to the user. Can contain HTML. The maximum length is 2048 characters. Optional.",
          "type": "string"
        },
        "parameters": {
          "description": "Additional properties related to a conference. An example would be a solution-specific setting for enabling video streaming.",
          "$ref": "ConferenceParameters"
        },
        "createRequest": {
          "$ref": "CreateConferenceRequest",
          "description": "A request to generate a new conference and attach it to the event. The data is generated asynchronously. To see whether the data is present check the status field.\nEither conferenceSolution and at least one entryPoint, or createRequest is required."
        },
        "conferenceId": {
          "type": "string",
          "description": "The ID of the conference.\nCan be used by developers to keep track of conferences, should not be displayed to users.\nThe ID value is formed differently for each conference solution type:  \n- eventHangout: ID is not set. (This conference type is deprecated.)\n- eventNamedHangout: ID is the name of the Hangout. (This conference type is deprecated.)\n- hangoutsMeet: ID is the 10-letter meeting code, for example aaa-bbbb-ccc.\n- addOn: ID is defined by the third-party provider.  Optional."
        },
        "entryPoints": {
          "type": "array",
          "description": "Information about individual conference entry points, such as URLs or phone numbers.\nAll of them must belong to the same conference.\nEither conferenceSolution and at least one entryPoint, or createRequest is required.",
          "items": {
            "$ref": "EntryPoint"
          }
        }
      },
      "type": "object"
    },
    "ConferenceSolution": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "The user-visible name of this solution. Not localized."
        },
        "iconUri": {
          "type": "string",
          "description": "The user-visible icon for this solution."
        },
        "key": {
          "$ref": "ConferenceSolutionKey",
          "description": "The key which can uniquely identify the conference solution for this event."
        }
      },
      "id": "ConferenceSolution"
    },
    "ConferenceSolutionKey": {
      "id": "ConferenceSolutionKey",
      "properties": {
        "type": {
          "description": "The conference solution type.\nIf a client encounters an unfamiliar or empty type, it should still be able to display the entry points. However, it should disallow modifications.\nThe possible values are:  \n- \"eventHangout\" for Hangouts for consumers (deprecated; existing events may show this conference solution type but new conferences cannot be created)\n- \"eventNamedHangout\" for classic Hangouts for Google Workspace users (deprecated; existing events may show this conference solution type but new conferences cannot be created)\n- \"hangoutsMeet\" for Google Meet (http://meet.google.com)\n- \"addOn\" for 3P conference providers",
          "type": "string"
        }
      },
      "type": "object"
    },
    "ConferenceParameters": {
      "id": "ConferenceParameters",
      "properties": {
        "addOnParameters": {
          "description": "Additional add-on specific data.",
          "$ref": "ConferenceParametersAddOnParameters"
        }
      },
      "type": "object"
    },
    "EventOutOfOfficeProperties": {
      "properties": {
        "declineMessage": {
          "description": "Response message to set if an existing event or new invitation is automatically declined by Calendar.",
          "type": "string"
        },
        "autoDeclineMode": {
          "type": "string",
          "description": "Whether to decline meeting invitations which overlap Out of office events. Valid values are declineNone, meaning that no meeting invitations are declined; declineAllConflictingInvitations, meaning that all conflicting meeting invitations that conflict with the event are declined; and declineOnlyNewConflictingInvitations, meaning that only new conflicting meeting invitations which arrive while the Out of office event is present are to be declined."
        }
      },
      "type": "object",
      "id": "EventOutOfOfficeProperties"
    },
    "CreateConferenceRequest": {
      "properties": {
        "status": {
          "$ref": "ConferenceRequestStatus",
          "description": "The status of the conference create request."
        },
        "conferenceSolutionKey": {
          "$ref": "ConferenceSolutionKey",
          "description": "The conference solution, such as Hangouts or Google Meet."
        },
        "requestId": {
          "type": "string",
          "description": "The client-generated unique ID for this request.\nClients should regenerate this ID for every new request. If an ID provided is the same as for the previous request, the request is ignored."
        }
      },
      "id": "CreateConferenceRequest",
      "type": "object"
    },
    "ConferenceRequestStatus": {
      "id": "ConferenceRequestStatus",
      "properties": {
        "statusCode": {
          "type": "string",
          "description": "The current status of the conference create request. Read-only.\nThe possible values are:  \n- \"pending\": the conference create request is still being processed.\n- \"success\": the conference create request succeeded, the entry points are populated.\n- \"failure\": the conference create request failed, there are no entry points."
        }
      },
      "type": "object"
    },
    "EventWorkingLocationProperties": {
      "id": "EventWorkingLocationProperties",
      "type": "object",
      "properties": {
        "customLocation": {
          "description": "If present, specifies that the user is working from a custom location.",
          "type": "object",
          "properties": {
            "label": {
              "description": "An optional extra label for additional information.",
              "type": "string"
            }
          }
        },
        "homeOffice": {
          "type": "any",
          "description": "If present, specifies that the user is working at home."
        },
        "officeLocation": {
          "description": "If present, specifies that the user is working from an office.",
          "type": "object",
          "properties": {
            "label": {
              "description": "The office name that's displayed in Calendar Web and Mobile clients. We recommend you reference a building name in the organization's Resources database.",
              "type": "string"
            },
            "floorSectionId": {
              "type": "string",
              "description": "An optional floor section identifier."
            },
            "deskId": {
              "description": "An optional desk identifier.",
              "type": "string"
            },
            "floorId": {
              "type": "string",
              "description": "An optional floor identifier."
            },
            "buildingId": {
              "description": "An optional building identifier. This should reference a building ID in the organization's Resources database.",
              "type": "string"
            }
          }
        },
        "type": {
          "description": "Type of the working location. Possible values are:  \n- \"homeOffice\" - The user is working at home. \n- \"officeLocation\" - The user is working from an office. \n- \"customLocation\" - The user is working from a custom location.  Any details are specified in a sub-field of the specified name, but this field may be missing if empty. Any other fields are ignored.\nRequired when adding working location properties.",
          "type": "string"
        }
      }
    },
    "EntryPoint": {
      "type": "object",
      "properties": {
        "accessCode": {
          "description": "The access code to access the conference. The maximum length is 128 characters.\nWhen creating new conference data, populate only the subset of {meetingCode, accessCode, passcode, password, pin} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.\nOptional.",
          "type": "string"
        },
        "meetingCode": {
          "type": "string",
          "description": "The meeting code to access the conference. The maximum length is 128 characters.\nWhen creating new conference data, populate only the subset of {meetingCode, accessCode, passcode, password, pin} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.\nOptional."
        },
        "password": {
          "type": "string",
          "description": "The password to access the conference. The maximum length is 128 characters.\nWhen creating new conference data, populate only the subset of {meetingCode, accessCode, passcode, password, pin} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.\nOptional."
        },
        "pin": {
          "type": "string",
          "description": "The PIN to access the conference. The maximum length is 128 characters.\nWhen creating new conference data, populate only the subset of {meetingCode, accessCode, passcode, password, pin} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed.\nOptional."
        },
        "entryPointType": {
          "description": "The type of the conference entry point.\nPossible values are:  \n- \"video\" - joining a conference over HTTP. A conference can have zero or one video entry point.\n- \"phone\" - joining a conference by dialing a phone number. A conference can have zero or more phone entry points.\n- \"sip\" - joining a conference over SIP. A conference can have zero or one sip entry point.\n- \"more\" - further conference joining instructions, for example additional phone numbers. A conference can have zero or one more entry point. A conference with only a more entry point is not a valid conference.",
          "type": "string"
        },
        "regionCode": {
          "type": "string",
          "description": "The CLDR/ISO 3166 region code for the country associated with this phone access. Example: \"SE\" for Sweden.\nCalendar backend will populate this field only for EntryPointType.PHONE."
        },
        "entryPointFeatures": {
          "type": "array",
          "description": "Features of the entry point, such as being toll or toll-free. One entry point can have multiple features. However, toll and toll-free cannot be both set on the same entry point.",
          "items": {
            "type": "string"
          }
        },
        "passcode": {
          "type": "string",
          "description": "The passcode to access the conference. The maximum length is 128 characters.\nWhen creating new conference data, populate only the subset of {meetingCode, accessCode, passcode, password, pin} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed."
        },
        "label": {
          "type": "string",
          "description": "The label for the URI. Visible to end users. Not localized. The maximum length is 512 characters.\nExamples:  \n- for video: meet.google.com/aaa-bbbb-ccc\n- for phone: +1 123 268 2601\n- for sip: 12345678@altostrat.com\n- for more: should not be filled  \nOptional."
        },
        "uri": {
          "type": "string",
          "description": "The URI of the entry point. The maximum length is 1300 characters.\nFormat:  \n- for video, http: or https: schema is required.\n- for phone, tel: schema is required. The URI should include the entire dial sequence (e.g., tel:+12345678900,,,123456789;1234).\n- for sip, sip: schema is required, e.g., sip:12345678@myprovider.com.\n- for more, http: or https: schema is required."
        }
      },
      "id": "EntryPoint"
    },
    "ConferenceParametersAddOnParameters": {
      "type": "object",
      "properties": {
        "parameters": {
          "additionalProperties": {
            "type": "string"
          },
          "type": "object"
        }
      },
      "id": "ConferenceParametersAddOnParameters"
    }
  }
};
