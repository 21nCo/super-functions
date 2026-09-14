// Generated discovery data; plain modules support the declared Node range.
export default {
  "source": "https://gmail.googleapis.com/$discovery/rest?version=v1",
  "sourceSha256": "679719496d4ea5c00ce7f851d04e6b1156dcb76a6b435369c79b2391d99d1256",
  "revision": "20260907",
  "rootUrl": "https://gmail.googleapis.com/",
  "servicePath": "",
  "methods": {
    "users.messages.list": {
      "scopes": [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.metadata",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.readonly"
      ],
      "description": "Lists the messages in the user's mailbox. For more information, see [List Gmail messages](https://developers.google.com/workspace/gmail/api/guides/list-messages).",
      "path": "gmail/v1/users/{userId}/messages",
      "parameters": {
        "maxResults": {
          "description": "Maximum number of messages to return. This field defaults to 100. The maximum allowed value for this field is 500.",
          "location": "query",
          "format": "uint32",
          "default": "100",
          "type": "integer"
        },
        "pageToken": {
          "description": "Page token to retrieve a specific page of results in the list.",
          "location": "query",
          "type": "string"
        },
        "labelIds": {
          "description": "Only return messages with labels that match all of the specified label IDs. Messages in a thread might have labels that other messages in the same thread don't have. To learn more, see [Manage labels on messages and threads](https://developers.google.com/workspace/gmail/api/guides/labels#manage_labels_on_messages_threads).",
          "repeated": true,
          "location": "query",
          "type": "string"
        },
        "includeSpamTrash": {
          "description": "Include messages from `SPAM` and `TRASH` in the results.",
          "default": "false",
          "location": "query",
          "type": "boolean"
        },
        "userId": {
          "required": true,
          "default": "me",
          "type": "string",
          "description": "The user's email address. The special value `me` can be used to indicate the authenticated user.",
          "location": "path"
        },
        "q": {
          "location": "query",
          "type": "string",
          "description": "Only return messages matching the specified query. Supports the same query format as the Gmail search box. For example, `\"from:someuser@example.com rfc822msgid: is:unread\"`. Parameter cannot be used when accessing the api using the gmail.metadata scope."
        }
      },
      "parameterOrder": [
        "userId"
      ],
      "id": "gmail.users.messages.list",
      "flatPath": "gmail/v1/users/{userId}/messages",
      "httpMethod": "GET",
      "response": {
        "$ref": "ListMessagesResponse"
      }
    },
    "users.messages.get": {
      "path": "gmail/v1/users/{userId}/messages/{id}",
      "parameters": {
        "id": {
          "location": "path",
          "type": "string",
          "description": "The ID of the message to retrieve. This ID is usually retrieved using `messages.list`. The ID is also contained in the result when a message is inserted (`messages.insert`) or imported (`messages.import`).",
          "required": true
        },
        "format": {
          "enumDescriptions": [
            "Returns only email message ID and labels; does not return the email headers, body, or payload.",
            "Returns the full email message data with body content parsed in the `payload` field; the `raw` field is not used. Format cannot be used when accessing the api using the gmail.metadata scope.",
            "Returns the full email message data with body content in the `raw` field as a base64url encoded string; the `payload` field is not used. Format cannot be used when accessing the api using the gmail.metadata scope.",
            "Returns only email message ID, labels, and email headers."
          ],
          "default": "full",
          "type": "string",
          "enum": [
            "minimal",
            "full",
            "raw",
            "metadata"
          ],
          "location": "query",
          "description": "The format to return the message in."
        },
        "metadataHeaders": {
          "description": "When given and format is `METADATA`, only include headers specified.",
          "repeated": true,
          "location": "query",
          "type": "string"
        },
        "userId": {
          "description": "The user's email address. The special value `me` can be used to indicate the authenticated user.",
          "location": "path",
          "required": true,
          "default": "me",
          "type": "string"
        }
      },
      "parameterOrder": [
        "userId",
        "id"
      ],
      "scopes": [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.addons.current.message.action",
        "https://www.googleapis.com/auth/gmail.addons.current.message.metadata",
        "https://www.googleapis.com/auth/gmail.addons.current.message.readonly",
        "https://www.googleapis.com/auth/gmail.metadata",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.readonly"
      ],
      "description": "Gets the specified message.",
      "flatPath": "gmail/v1/users/{userId}/messages/{id}",
      "httpMethod": "GET",
      "response": {
        "$ref": "Message"
      },
      "id": "gmail.users.messages.get"
    },
    "users.threads.get": {
      "id": "gmail.users.threads.get",
      "httpMethod": "GET",
      "response": {
        "$ref": "Thread"
      },
      "flatPath": "gmail/v1/users/{userId}/threads/{id}",
      "scopes": [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.addons.current.message.action",
        "https://www.googleapis.com/auth/gmail.addons.current.message.metadata",
        "https://www.googleapis.com/auth/gmail.addons.current.message.readonly",
        "https://www.googleapis.com/auth/gmail.metadata",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.readonly"
      ],
      "description": "Gets the specified thread. For more information, see [Manage threads](https://developers.google.com/workspace/gmail/api/guides/threads).",
      "path": "gmail/v1/users/{userId}/threads/{id}",
      "parameters": {
        "id": {
          "location": "path",
          "type": "string",
          "description": "The ID of the thread to retrieve.",
          "required": true
        },
        "format": {
          "default": "full",
          "type": "string",
          "enum": [
            "full",
            "metadata",
            "minimal"
          ],
          "enumDescriptions": [
            "Returns the full email message data with body content parsed in the `payload` field; the `raw` field is not used. Format cannot be used when accessing the api using the gmail.metadata scope.",
            "Returns only email message IDs, labels, and email headers.",
            "Returns only email message IDs and labels; does not return the email headers, body, or payload."
          ],
          "location": "query",
          "description": "The format to return the messages in."
        },
        "metadataHeaders": {
          "location": "query",
          "type": "string",
          "description": "When given and format is METADATA, only include headers specified.",
          "repeated": true
        },
        "userId": {
          "location": "path",
          "description": "The user's email address. The special value `me` can be used to indicate the authenticated user.",
          "default": "me",
          "type": "string",
          "required": true
        }
      },
      "parameterOrder": [
        "userId",
        "id"
      ]
    },
    "users.messages.attachments.get": {
      "path": "gmail/v1/users/{userId}/messages/{messageId}/attachments/{id}",
      "parameters": {
        "id": {
          "description": "The ID of the attachment.",
          "required": true,
          "location": "path",
          "type": "string"
        },
        "userId": {
          "required": true,
          "default": "me",
          "type": "string",
          "description": "The user's email address. The special value `me` can be used to indicate the authenticated user.",
          "location": "path"
        },
        "messageId": {
          "location": "path",
          "type": "string",
          "description": "The ID of the message containing the attachment.",
          "required": true
        }
      },
      "parameterOrder": [
        "userId",
        "messageId",
        "id"
      ],
      "scopes": [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.addons.current.message.action",
        "https://www.googleapis.com/auth/gmail.addons.current.message.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.readonly"
      ],
      "description": "Gets the specified message attachment.",
      "httpMethod": "GET",
      "response": {
        "$ref": "MessagePartBody"
      },
      "flatPath": "gmail/v1/users/{userId}/messages/{messageId}/attachments/{id}",
      "id": "gmail.users.messages.attachments.get"
    },
    "users.labels.list": {
      "scopes": [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.labels",
        "https://www.googleapis.com/auth/gmail.metadata",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.readonly"
      ],
      "description": "Lists all labels in the user's mailbox. For more information, see [Manage labels](https://developers.google.com/workspace/gmail/api/guides/labels).",
      "path": "gmail/v1/users/{userId}/labels",
      "parameters": {
        "userId": {
          "description": "The user's email address. The special value `me` can be used to indicate the authenticated user.",
          "location": "path",
          "required": true,
          "default": "me",
          "type": "string"
        }
      },
      "parameterOrder": [
        "userId"
      ],
      "id": "gmail.users.labels.list",
      "httpMethod": "GET",
      "response": {
        "$ref": "ListLabelsResponse"
      },
      "flatPath": "gmail/v1/users/{userId}/labels"
    },
    "users.messages.modify": {
      "scopes": [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.modify"
      ],
      "description": "Modifies the labels and the Classification Label values on the specified message. For administrators modifying message for users in their organization, requests require authorization with a [service account](https://developers.google.com/identity/protocols/OAuth2ServiceAccount) that has [domain-wide delegation authority](https://developers.google.com/identity/protocols/OAuth2ServiceAccount#delegatingauthority) to impersonate users with the `https://www.googleapis.com/auth/gmail.modify.restricted` scope.",
      "parameters": {
        "userId": {
          "location": "path",
          "description": "The user's email address. The special value `me` can be used to indicate the authenticated user.",
          "default": "me",
          "type": "string",
          "required": true
        },
        "id": {
          "description": "The ID of the message to modify.",
          "required": true,
          "location": "path",
          "type": "string"
        }
      },
      "parameterOrder": [
        "userId",
        "id"
      ],
      "path": "gmail/v1/users/{userId}/messages/{id}/modify",
      "id": "gmail.users.messages.modify",
      "httpMethod": "POST",
      "response": {
        "$ref": "Message"
      },
      "request": {
        "$ref": "ModifyMessageRequest"
      },
      "flatPath": "gmail/v1/users/{userId}/messages/{id}/modify"
    },
    "users.drafts.create": {
      "path": "gmail/v1/users/{userId}/drafts",
      "parameters": {
        "userId": {
          "description": "The user's email address. The special value `me` can be used to indicate the authenticated user.",
          "location": "path",
          "required": true,
          "default": "me",
          "type": "string"
        }
      },
      "parameterOrder": [
        "userId"
      ],
      "mediaUpload": {
        "protocols": {
          "simple": {
            "path": "/upload/gmail/v1/users/{userId}/drafts",
            "multipart": true
          },
          "resumable": {
            "path": "/resumable/upload/gmail/v1/users/{userId}/drafts",
            "multipart": true
          }
        },
        "maxSize": "36700160",
        "accept": [
          "message/*"
        ]
      },
      "supportsMediaUpload": true,
      "scopes": [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.addons.current.action.compose",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/gmail.modify"
      ],
      "description": "Creates a draft with the `DRAFT` label. For more information, see [Create and send draft emails](https://developers.google.com/workspace/gmail/api/guides/drafts).",
      "flatPath": "gmail/v1/users/{userId}/drafts",
      "request": {
        "$ref": "Draft"
      },
      "httpMethod": "POST",
      "response": {
        "$ref": "Draft"
      },
      "id": "gmail.users.drafts.create"
    },
    "users.drafts.update": {
      "httpMethod": "PUT",
      "response": {
        "$ref": "Draft"
      },
      "request": {
        "$ref": "Draft"
      },
      "flatPath": "gmail/v1/users/{userId}/drafts/{id}",
      "id": "gmail.users.drafts.update",
      "parameters": {
        "userId": {
          "default": "me",
          "type": "string",
          "required": true,
          "location": "path",
          "description": "The user's email address. The special value `me` can be used to indicate the authenticated user."
        },
        "id": {
          "location": "path",
          "type": "string",
          "description": "The ID of the draft to update.",
          "required": true
        }
      },
      "parameterOrder": [
        "userId",
        "id"
      ],
      "path": "gmail/v1/users/{userId}/drafts/{id}",
      "scopes": [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.addons.current.action.compose",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/gmail.modify"
      ],
      "description": "Replaces a draft's content. For more information, see [Create and send draft emails](https://developers.google.com/workspace/gmail/api/guides/drafts).",
      "supportsMediaUpload": true,
      "mediaUpload": {
        "accept": [
          "message/*"
        ],
        "maxSize": "36700160",
        "protocols": {
          "simple": {
            "multipart": true,
            "path": "/upload/gmail/v1/users/{userId}/drafts/{id}"
          },
          "resumable": {
            "path": "/resumable/upload/gmail/v1/users/{userId}/drafts/{id}",
            "multipart": true
          }
        }
      }
    },
    "users.drafts.send": {
      "id": "gmail.users.drafts.send",
      "request": {
        "$ref": "Draft"
      },
      "flatPath": "gmail/v1/users/{userId}/drafts/send",
      "httpMethod": "POST",
      "response": {
        "$ref": "Message"
      },
      "supportsMediaUpload": true,
      "mediaUpload": {
        "protocols": {
          "resumable": {
            "multipart": true,
            "path": "/resumable/upload/gmail/v1/users/{userId}/drafts/send"
          },
          "simple": {
            "multipart": true,
            "path": "/upload/gmail/v1/users/{userId}/drafts/send"
          }
        },
        "accept": [
          "message/*"
        ],
        "maxSize": "36700160"
      },
      "scopes": [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.addons.current.action.compose",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/gmail.modify"
      ],
      "description": "Sends the specified, existing draft to the recipients in the `To`, `Cc`, and `Bcc` headers. For more information, see [Create and send draft emails](https://developers.google.com/workspace/gmail/api/guides/drafts).",
      "parameters": {
        "userId": {
          "location": "path",
          "description": "The user's email address. The special value `me` can be used to indicate the authenticated user.",
          "default": "me",
          "type": "string",
          "required": true
        }
      },
      "parameterOrder": [
        "userId"
      ],
      "path": "gmail/v1/users/{userId}/drafts/send"
    },
    "users.messages.send": {
      "scopes": [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.addons.current.action.compose",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send"
      ],
      "description": "Sends the specified message to the recipients in the `To`, `Cc`, and `Bcc` headers. For more information, see [Create and send email messages](https://developers.google.com/workspace/gmail/api/guides/sending).",
      "supportsMediaUpload": true,
      "mediaUpload": {
        "maxSize": "36700160",
        "accept": [
          "message/*"
        ],
        "protocols": {
          "simple": {
            "path": "/upload/gmail/v1/users/{userId}/messages/send",
            "multipart": true
          },
          "resumable": {
            "path": "/resumable/upload/gmail/v1/users/{userId}/messages/send",
            "multipart": true
          }
        }
      },
      "parameters": {
        "userId": {
          "default": "me",
          "type": "string",
          "required": true,
          "location": "path",
          "description": "The user's email address. The special value `me` can be used to indicate the authenticated user."
        }
      },
      "parameterOrder": [
        "userId"
      ],
      "path": "gmail/v1/users/{userId}/messages/send",
      "id": "gmail.users.messages.send",
      "httpMethod": "POST",
      "response": {
        "$ref": "Message"
      },
      "request": {
        "$ref": "Message"
      },
      "flatPath": "gmail/v1/users/{userId}/messages/send"
    }
  },
  "schemas": {
    "ListMessagesResponse": {
      "id": "ListMessagesResponse",
      "type": "object",
      "properties": {
        "nextPageToken": {
          "type": "string",
          "description": "Token to retrieve the next page of results in the list."
        },
        "messages": {
          "description": "List of messages. Note that each message resource contains only an `id` and a `threadId`. Additional message details can be fetched using the messages.get method.",
          "type": "array",
          "items": {
            "$ref": "Message"
          }
        },
        "resultSizeEstimate": {
          "type": "integer",
          "description": "Estimated total number of results.",
          "format": "uint32"
        }
      }
    },
    "Message": {
      "properties": {
        "historyId": {
          "description": "The ID of the last history record that modified this message.",
          "format": "uint64",
          "type": "string"
        },
        "internalDate": {
          "type": "string",
          "description": "The internal message creation timestamp (epoch ms), which determines ordering in the inbox. For normal SMTP-received email, this represents the time the message was originally accepted by Google, which is more reliable than the `Date` header. However, for API-migrated mail, it can be configured by client to be based on the `Date` header.",
          "format": "int64"
        },
        "id": {
          "description": "The immutable ID of the message.",
          "type": "string"
        },
        "sizeEstimate": {
          "description": "Estimated size in bytes of the message.",
          "format": "int32",
          "type": "integer"
        },
        "payload": {
          "description": "The parsed email structure in the message parts.",
          "$ref": "MessagePart"
        },
        "labelIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "List of IDs of labels applied to this message."
        },
        "snippet": {
          "description": "A short part of the message text.",
          "type": "string"
        },
        "threadId": {
          "type": "string",
          "description": "The ID of the thread the message belongs to. To add a message or draft to a thread, the following criteria must be met: 1. The requested `threadId` must be specified on the `Message` or `Draft.Message` you supply with your request. 2. The `References` and `In-Reply-To` headers must be set in compliance with the [RFC 2822](https://tools.ietf.org/html/rfc2822) standard. 3. The `Subject` headers must match. "
        },
        "classificationLabelValues": {
          "type": "array",
          "items": {
            "$ref": "ClassificationLabelValue"
          },
          "description": "Classification Label values on the message. Available Classification Label schemas can be queried using the Google Drive Labels API. Each classification label ID must be unique. If duplicate IDs are provided, only one will be retained, and the selection is arbitrary. Only used for Google Workspace accounts. There's a limit of 20 Classification Label values per request. If the Classification Label values exceeds the maximum allowed number, the request fails."
        },
        "raw": {
          "type": "string",
          "description": "The entire email message in an RFC 2822 formatted and base64url encoded string. Returned in `messages.get` and `drafts.get` responses when the `format=RAW` parameter is supplied. @required gmail.users.drafts.create gmail.users.drafts.update",
          "format": "byte",
          "annotations": {
            "required": [
              "gmail.users.messages.insert",
              "gmail.users.messages.send"
            ]
          }
        }
      },
      "id": "Message",
      "description": "An email message.",
      "type": "object"
    },
    "MessagePart": {
      "properties": {
        "headers": {
          "type": "array",
          "items": {
            "$ref": "MessagePartHeader"
          },
          "description": "List of headers on this message part. For the top-level message part, representing the entire message payload, it will contain the standard RFC 2822 email headers such as `To`, `From`, and `Subject`."
        },
        "partId": {
          "type": "string",
          "description": "The immutable ID of the message part."
        },
        "mimeType": {
          "description": "The MIME type of the message part.",
          "type": "string"
        },
        "body": {
          "description": "The message part body for this part, which may be empty for container MIME message parts.",
          "$ref": "MessagePartBody"
        },
        "filename": {
          "type": "string",
          "description": "The filename of the attachment. Only present if this message part represents an attachment."
        },
        "parts": {
          "description": "The child MIME message parts of this part. This only applies to container MIME message parts, for example `multipart/*`. For non- container MIME message part types, such as `text/plain`, this field is empty. For more information, see RFC 1521.",
          "type": "array",
          "items": {
            "$ref": "MessagePart"
          }
        }
      },
      "id": "MessagePart",
      "description": "A single MIME message part.",
      "type": "object"
    },
    "MessagePartHeader": {
      "id": "MessagePartHeader",
      "type": "object",
      "properties": {
        "name": {
          "description": "The name of the header before the `:` separator. For example, `To`.",
          "type": "string"
        },
        "value": {
          "description": "The value of the header after the `:` separator. For example, `someuser@example.com`.",
          "type": "string"
        }
      }
    },
    "MessagePartBody": {
      "properties": {
        "size": {
          "type": "integer",
          "description": "Number of bytes for the message part data (encoding notwithstanding).",
          "format": "int32"
        },
        "attachmentId": {
          "description": "When present, contains the ID of an external attachment that can be retrieved in a separate `messages.attachments.get` request. When not present, the entire content of the message part body is contained in the data field.",
          "type": "string"
        },
        "data": {
          "description": "The body data of a MIME message part as a base64url encoded string. May be empty for MIME container types that have no message body or when the body data is sent as a separate attachment. An attachment ID is present if the body data is contained in a separate attachment.",
          "format": "byte",
          "type": "string"
        }
      },
      "id": "MessagePartBody",
      "description": "The body of a single MIME message part.",
      "type": "object"
    },
    "ClassificationLabelValue": {
      "properties": {
        "labelId": {
          "type": "string",
          "description": "Required. The canonical or raw alphanumeric classification label ID. Maps to the ID field of the Google Drive Label resource."
        },
        "fields": {
          "type": "array",
          "items": {
            "$ref": "ClassificationLabelFieldValue"
          },
          "description": "Field values for the given classification label ID."
        }
      },
      "id": "ClassificationLabelValue",
      "description": "Classification Labels applied to the email message. Classification Labels are different from Gmail inbox labels. Only used for Google Workspace accounts. [Learn more about classification labels](https://support.google.com/a/answer/9292382).",
      "type": "object"
    },
    "ClassificationLabelFieldValue": {
      "id": "ClassificationLabelFieldValue",
      "description": "Field values for a classification label.",
      "type": "object",
      "properties": {
        "fieldId": {
          "type": "string",
          "description": "Required. The field ID for the Classification Label Value. Maps to the ID field of the Google Drive `Label.Field` object."
        },
        "selection": {
          "type": "string",
          "description": "Selection choice ID for the selection option. Should only be set if the field type is `SELECTION` in the Google Drive `Label.Field` object. Maps to the id field of the Google Drive `Label.Field.SelectionOptions` resource."
        }
      }
    },
    "Thread": {
      "type": "object",
      "id": "Thread",
      "description": "A collection of messages representing a conversation.",
      "properties": {
        "historyId": {
          "type": "string",
          "description": "The ID of the last history record that modified this thread.",
          "format": "uint64"
        },
        "messages": {
          "description": "The list of messages in the thread.",
          "type": "array",
          "items": {
            "$ref": "Message"
          }
        },
        "id": {
          "type": "string",
          "description": "The unique ID of the thread."
        },
        "snippet": {
          "type": "string",
          "description": "A short part of the message text."
        }
      }
    },
    "ListLabelsResponse": {
      "type": "object",
      "id": "ListLabelsResponse",
      "properties": {
        "labels": {
          "type": "array",
          "items": {
            "$ref": "Label"
          },
          "description": "List of labels. Note that each label resource only contains an `id`, `name`, `messageListVisibility`, `labelListVisibility`, and `type`. The [`labels.get`](https://developers.google.com/workspace/gmail/api/v1/reference/users/labels/get) method can fetch additional label details."
        }
      }
    },
    "Label": {
      "type": "object",
      "id": "Label",
      "description": "Labels are used to categorize messages and threads within the user's mailbox. The maximum number of labels supported for a user's mailbox is 10,000.",
      "properties": {
        "type": {
          "description": "The owner type for the label. User labels are created by the user and can be modified and deleted by the user and can be applied to any message or thread. System labels are internally created and cannot be added, modified, or deleted. System labels may be able to be applied to or removed from messages and threads under some circumstances but this is not guaranteed. For example, users can apply and remove the `INBOX` and `UNREAD` labels from messages and threads, but cannot apply or remove the `DRAFTS` or `SENT` labels from messages or threads.",
          "type": "string",
          "enum": [
            "system",
            "user"
          ],
          "enumDescriptions": [
            "Labels created by Gmail.",
            "Custom labels created by the user or application."
          ]
        },
        "messagesUnread": {
          "description": "The number of unread messages with the label.",
          "format": "int32",
          "type": "integer"
        },
        "messageListVisibility": {
          "enumDescriptions": [
            "Show the label in the message list.",
            "Do not show the label in the message list."
          ],
          "annotations": {
            "required": [
              "gmail.users.labels.create",
              "gmail.users.labels.update"
            ]
          },
          "type": "string",
          "enum": [
            "show",
            "hide"
          ],
          "description": "The visibility of messages with this label in the message list in the Gmail web interface."
        },
        "labelListVisibility": {
          "annotations": {
            "required": [
              "gmail.users.labels.create",
              "gmail.users.labels.update"
            ]
          },
          "enumDescriptions": [
            "Show the label in the label list.",
            "Show the label if there are any unread messages with that label.",
            "Do not show the label in the label list."
          ],
          "type": "string",
          "enum": [
            "labelShow",
            "labelShowIfUnread",
            "labelHide"
          ],
          "description": "The visibility of the label in the label list in the Gmail web interface."
        },
        "threadsTotal": {
          "type": "integer",
          "description": "The total number of threads with the label.",
          "format": "int32"
        },
        "id": {
          "annotations": {
            "required": [
              "gmail.users.labels.update"
            ]
          },
          "description": "The immutable ID of the label.",
          "type": "string"
        },
        "name": {
          "type": "string",
          "description": "The display name of the label.",
          "annotations": {
            "required": [
              "gmail.users.labels.create",
              "gmail.users.labels.update"
            ]
          }
        },
        "color": {
          "description": "The color to assign to the label. Color is only available for labels that have their `type` set to `user`.",
          "$ref": "LabelColor"
        },
        "threadsUnread": {
          "description": "The number of unread threads with the label.",
          "format": "int32",
          "type": "integer"
        },
        "messagesTotal": {
          "description": "The total number of messages with the label.",
          "format": "int32",
          "type": "integer"
        }
      }
    },
    "LabelColor": {
      "properties": {
        "textColor": {
          "description": "The text color of the label, represented as hex string. This field is required in order to set the color of a label. Only the following predefined set of color values are allowed: \\#000000, #434343, #666666, #999999, #cccccc, #efefef, #f3f3f3, #ffffff, \\#fb4c2f, #ffad47, #fad165, #16a766, #43d692, #4a86e8, #a479e2, #f691b3, \\#f6c5be, #ffe6c7, #fef1d1, #b9e4d0, #c6f3de, #c9daf8, #e4d7f5, #fcdee8, \\#efa093, #ffd6a2, #fce8b3, #89d3b2, #a0eac9, #a4c2f4, #d0bcf1, #fbc8d9, \\#e66550, #ffbc6b, #fcda83, #44b984, #68dfa9, #6d9eeb, #b694e8, #f7a7c0, \\#cc3a21, #eaa041, #f2c960, #149e60, #3dc789, #3c78d8, #8e63ce, #e07798, \\#ac2b16, #cf8933, #d5ae49, #0b804b, #2a9c68, #285bac, #653e9b, #b65775, \\#822111, #a46a21, #aa8831, #076239, #1a764d, #1c4587, #41236d, #83334c, \\#464646, #e7e7e7, #0d3472, #b6cff5, #0d3b44, #98d7e4, #3d188e, #e3d7ff, \\#711a36, #fbd3e0, #8a1c0a, #f2b2a8, #7a2e0b, #ffc8af, #7a4706, #ffdeb5, \\#594c05, #fbe983, #684e07, #fdedc1, #0b4f30, #b3efd3, #04502e, #a2dcc1, \\#c2c2c2, #4986e7, #2da2bb, #b99aff, #994a64, #f691b2, #ff7537, #ffad46, \\#662e37, #ebdbde, #cca6ac, #094228, #42d692, #16a765, #757575, #1e53b8, \\#007286, #7858c3, #c2185b, #d93025, #54240e, #633e04, #521d28, #202124, \\#083018",
          "type": "string"
        },
        "backgroundColor": {
          "type": "string",
          "description": "The background color represented as hex string #RRGGBB (ex #000000). This field is required in order to set the color of a label. Only the following predefined set of color values are allowed: \\#000000, #434343, #666666, #999999, #cccccc, #efefef, #f3f3f3, #ffffff, \\#fb4c2f, #ffad47, #fad165, #16a766, #43d692, #4a86e8, #a479e2, #f691b3, \\#f6c5be, #ffe6c7, #fef1d1, #b9e4d0, #c6f3de, #c9daf8, #e4d7f5, #fcdee8, \\#efa093, #ffd6a2, #fce8b3, #89d3b2, #a0eac9, #a4c2f4, #d0bcf1, #fbc8d9, \\#e66550, #ffbc6b, #fcda83, #44b984, #68dfa9, #6d9eeb, #b694e8, #f7a7c0, \\#cc3a21, #eaa041, #f2c960, #149e60, #3dc789, #3c78d8, #8e63ce, #e07798, \\#ac2b16, #cf8933, #d5ae49, #0b804b, #2a9c68, #285bac, #653e9b, #b65775, \\#822111, #a46a21, #aa8831, #076239, #1a764d, #1c4587, #41236d, #83334c, \\#464646, #e7e7e7, #0d3472, #b6cff5, #0d3b44, #98d7e4, #3d188e, #e3d7ff, \\#711a36, #fbd3e0, #8a1c0a, #f2b2a8, #7a2e0b, #ffc8af, #7a4706, #ffdeb5, \\#594c05, #fbe983, #684e07, #fdedc1, #0b4f30, #b3efd3, #04502e, #a2dcc1, \\#c2c2c2, #4986e7, #2da2bb, #b99aff, #994a64, #f691b2, #ff7537, #ffad46, \\#662e37, #ebdbde, #cca6ac, #094228, #42d692, #16a765, #757575, #1e53b8, \\#007286, #7858c3, #c2185b, #d93025, #54240e, #633e04, #521d28, #202124, \\#083018"
        }
      },
      "id": "LabelColor",
      "type": "object"
    },
    "ModifyMessageRequest": {
      "id": "ModifyMessageRequest",
      "type": "object",
      "properties": {
        "removeLabelIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "A list IDs of labels to remove from this message. You can remove up to 100 labels with each update."
        },
        "addClassificationLabels": {
          "description": "A list of classification label values to add. If a Classification Label with the same label ID is already applied to the message, fields with existing field IDs will be updated and fields with new field IDs will be added. There's a limit of 20 Classification Label values per request. If the message is already classified and the final total number of Classification Label values exceeds the maximum allowed number of Classification Label values per message, the modification fails.",
          "type": "array",
          "items": {
            "$ref": "ClassificationLabelValue"
          }
        },
        "removeClassificationLabelIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "A list of Classification Label values to remove from this message."
        },
        "addLabelIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "A list of IDs of labels to add to this message. You can add up to 100 labels with each update."
        }
      }
    },
    "Draft": {
      "properties": {
        "id": {
          "annotations": {
            "required": [
              "gmail.users.drafts.send"
            ]
          },
          "description": "The immutable ID of the draft.",
          "type": "string"
        },
        "message": {
          "description": "The message content of the draft.",
          "$ref": "Message"
        }
      },
      "type": "object",
      "id": "Draft",
      "description": "A draft email in the user's mailbox."
    }
  }
};
