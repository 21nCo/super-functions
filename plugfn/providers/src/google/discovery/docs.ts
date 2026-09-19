// Generated discovery data; plain modules support the declared Node range.
export default {
  "source": "https://docs.googleapis.com/$discovery/rest?version=v1",
  "sourceSha256": "4deee830449244b659933afa16b28aef8989d7b5c30f6bdb20203eb9a596053b",
  "revision": "20260904",
  "rootUrl": "https://docs.googleapis.com/",
  "servicePath": "",
  "methods": {
    "documents.get": {
      "parameterOrder": [
        "documentId"
      ],
      "parameters": {
        "includeTabsContent": {
          "type": "boolean",
          "description": "Whether to populate the `Document.tabs` field instead of the text content fields like `body` and `documentStyle` on `Document`. - When `true`: Document content populates in the `Document.tabs` field instead of the text content fields in `Document`. - When `false`: The content of the document's first tab populates the content fields in `Document` excluding `Document.tabs`. If a document has only one tab, then that tab is used to populate the document content. `Document.tabs` will be empty. If you use a field mask that references the `Document.tabs` field (or any subfield), the API implicitly treats the request as if you set `include_tabs_content` to `true`.",
          "location": "query"
        },
        "documentId": {
          "type": "string",
          "required": true,
          "description": "The ID of the document to retrieve.",
          "location": "path"
        },
        "suggestionsViewMode": {
          "enum": [
            "DEFAULT_FOR_CURRENT_ACCESS",
            "SUGGESTIONS_INLINE",
            "PREVIEW_SUGGESTIONS_ACCEPTED",
            "PREVIEW_WITHOUT_SUGGESTIONS"
          ],
          "description": "The suggestions view mode to apply to the document. This allows viewing the document with all suggestions inline, accepted or rejected. If one is not specified, DEFAULT_FOR_CURRENT_ACCESS is used.",
          "type": "string",
          "location": "query",
          "enumDescriptions": [
            "The SuggestionsViewMode applied to the returned document depends on the user's current access level. If the user only has view access, PREVIEW_WITHOUT_SUGGESTIONS is applied. Otherwise, SUGGESTIONS_INLINE is applied. This is the default suggestions view mode.",
            "The returned document has suggestions inline. Suggested changes will be differentiated from base content within the document. Requests to retrieve a document using this mode will return a 403 error if the user does not have permission to view suggested changes.",
            "The returned document is a preview with all suggested changes accepted. Requests to retrieve a document using this mode will return a 403 error if the user does not have permission to view suggested changes.",
            "The returned document is a preview with all suggested changes rejected if there are any suggestions in the document."
          ]
        }
      },
      "id": "docs.documents.get",
      "description": "Gets the latest version of the specified document.",
      "scopes": [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/documents.readonly",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.readonly"
      ],
      "path": "v1/documents/{documentId}",
      "httpMethod": "GET",
      "flatPath": "v1/documents/{documentId}",
      "response": {
        "$ref": "Document"
      }
    },
    "documents.create": {
      "flatPath": "v1/documents",
      "path": "v1/documents",
      "response": {
        "$ref": "Document"
      },
      "id": "docs.documents.create",
      "httpMethod": "POST",
      "parameterOrder": [],
      "request": {
        "$ref": "Document"
      },
      "description": "Creates a blank document using the title given in the request. Other fields in the request, including any provided content, are ignored. Returns the created document.",
      "parameters": {},
      "scopes": [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file"
      ]
    },
    "documents.batchUpdate": {
      "request": {
        "$ref": "BatchUpdateDocumentRequest"
      },
      "flatPath": "v1/documents/{documentId}:batchUpdate",
      "response": {
        "$ref": "BatchUpdateDocumentResponse"
      },
      "id": "docs.documents.batchUpdate",
      "httpMethod": "POST",
      "path": "v1/documents/{documentId}:batchUpdate",
      "description": "Applies one or more updates to the document. Each request is validated before being applied. If any request is not valid, then the entire request will fail and nothing will be applied. Some requests have replies to give you some information about how they are applied. Other requests do not need to return information; these each return an empty reply. The order of replies matches that of the requests. For example, suppose you call batchUpdate with four updates, and only the third one returns information. The response would have two empty replies, the reply to the third request, and another empty reply, in that order. Because other users may be editing the document, the document might not exactly reflect your changes: your changes may be altered with respect to collaborator changes. If there are no collaborators, the document should reflect your changes. In any case, the updates in your request are guaranteed to be applied together atomically.",
      "parameters": {
        "documentId": {
          "type": "string",
          "required": true,
          "location": "path",
          "description": "The ID of the document to update."
        }
      },
      "scopes": [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file"
      ],
      "parameterOrder": [
        "documentId"
      ]
    }
  },
  "schemas": {
    "BatchUpdateDocumentRequest": {
      "id": "BatchUpdateDocumentRequest",
      "description": "Request message for BatchUpdateDocument.",
      "properties": {
        "writeControl": {
          "$ref": "WriteControl",
          "description": "Provides control over how write requests are executed."
        },
        "requests": {
          "items": {
            "$ref": "Request"
          },
          "description": "A list of updates to apply to the document.",
          "type": "array"
        }
      },
      "type": "object"
    },
    "WriteControl": {
      "type": "object",
      "properties": {
        "targetRevisionId": {
          "type": "string",
          "description": "The optional target revision ID of the document the write request is applied to. If collaborator changes have occurred after the document was read using the API, the changes produced by this write request are applied against the collaborator changes. This results in a new revision of the document that incorporates both the collaborator changes and the changes in the request, with the Docs server resolving conflicting changes. When using target revision ID, the API client can be thought of as another collaborator of the document. The target revision ID can only be used to write to recent versions of a document. If the target revision is too far behind the latest revision, the request is not processed and returns a 400 bad request error. The request should be tried again after retrieving the latest version of the document. Usually a revision ID remains valid for use as a target revision for several minutes after it's read, but for frequently edited documents this window might be shorter."
        },
        "requiredRevisionId": {
          "type": "string",
          "description": "The optional revision ID of the document the write request is applied to. If this is not the latest revision of the document, the request is not processed and returns a 400 bad request error. When a required revision ID is returned in a response, it indicates the revision ID of the document after the request was applied."
        }
      },
      "id": "WriteControl",
      "description": "Provides control over how write requests are executed."
    },
    "Request": {
      "id": "Request",
      "type": "object",
      "properties": {
        "insertTableColumn": {
          "$ref": "InsertTableColumnRequest",
          "description": "Inserts an empty column into a table."
        },
        "unmergeTableCells": {
          "description": "Unmerges cells in a table.",
          "$ref": "UnmergeTableCellsRequest"
        },
        "updateNamedStyle": {
          "$ref": "UpdateNamedStyleRequest",
          "description": "Updates a named style."
        },
        "insertDate": {
          "description": "Inserts a date.",
          "$ref": "InsertDateRequest"
        },
        "insertSectionBreak": {
          "description": "Inserts a section break at the specified location.",
          "$ref": "InsertSectionBreakRequest"
        },
        "updateTextStyle": {
          "$ref": "UpdateTextStyleRequest",
          "description": "Updates the text style at the specified range."
        },
        "replaceAllText": {
          "description": "Replaces all instances of the specified text.",
          "$ref": "ReplaceAllTextRequest"
        },
        "deleteFooter": {
          "description": "Deletes a footer from the document.",
          "$ref": "DeleteFooterRequest"
        },
        "updateTableCellStyle": {
          "description": "Updates the style of table cells.",
          "$ref": "UpdateTableCellStyleRequest"
        },
        "replaceImage": {
          "$ref": "ReplaceImageRequest",
          "description": "Replaces an image in the document."
        },
        "insertPageBreak": {
          "description": "Inserts a page break at the specified location.",
          "$ref": "InsertPageBreakRequest"
        },
        "deletePositionedObject": {
          "$ref": "DeletePositionedObjectRequest",
          "description": "Deletes a positioned object from the document."
        },
        "createFootnote": {
          "$ref": "CreateFootnoteRequest",
          "description": "Creates a footnote."
        },
        "insertInlineImage": {
          "description": "Inserts an inline image at the specified location.",
          "$ref": "InsertInlineImageRequest"
        },
        "deleteTableRow": {
          "description": "Deletes a row from a table.",
          "$ref": "DeleteTableRowRequest"
        },
        "createNamedRange": {
          "$ref": "CreateNamedRangeRequest",
          "description": "Creates a named range."
        },
        "deleteHeader": {
          "$ref": "DeleteHeaderRequest",
          "description": "Deletes a header from the document."
        },
        "mergeTableCells": {
          "$ref": "MergeTableCellsRequest",
          "description": "Merges cells in a table."
        },
        "pinTableHeaderRows": {
          "description": "Updates the number of pinned header rows in a table.",
          "$ref": "PinTableHeaderRowsRequest"
        },
        "updateDocumentStyle": {
          "description": "Updates the style of the document.",
          "$ref": "UpdateDocumentStyleRequest"
        },
        "deleteNamedRange": {
          "description": "Deletes a named range.",
          "$ref": "DeleteNamedRangeRequest"
        },
        "updateParagraphStyle": {
          "$ref": "UpdateParagraphStyleRequest",
          "description": "Updates the paragraph style at the specified range."
        },
        "insertText": {
          "description": "Inserts text at the specified location.",
          "$ref": "InsertTextRequest"
        },
        "deleteContentRange": {
          "$ref": "DeleteContentRangeRequest",
          "description": "Deletes content from the document."
        },
        "updateTableRowStyle": {
          "$ref": "UpdateTableRowStyleRequest",
          "description": "Updates the row style in a table."
        },
        "insertTableRow": {
          "description": "Inserts an empty row into a table.",
          "$ref": "InsertTableRowRequest"
        },
        "updateTableColumnProperties": {
          "description": "Updates the properties of columns in a table.",
          "$ref": "UpdateTableColumnPropertiesRequest"
        },
        "updateSectionStyle": {
          "description": "Updates the section style of the specified range.",
          "$ref": "UpdateSectionStyleRequest"
        },
        "updateDocumentTabProperties": {
          "description": "Updates the properties of a document tab.",
          "$ref": "UpdateDocumentTabPropertiesRequest"
        },
        "deleteTableColumn": {
          "$ref": "DeleteTableColumnRequest",
          "description": "Deletes a column from a table."
        },
        "insertTable": {
          "$ref": "InsertTableRequest",
          "description": "Inserts a table at the specified location."
        },
        "insertRichLink": {
          "$ref": "InsertRichLinkRequest",
          "description": "Insert a rich link."
        },
        "deleteParagraphBullets": {
          "$ref": "DeleteParagraphBulletsRequest",
          "description": "Deletes bullets from paragraphs."
        },
        "createHeader": {
          "$ref": "CreateHeaderRequest",
          "description": "Creates a header."
        },
        "createParagraphBullets": {
          "description": "Creates bullets for paragraphs.",
          "$ref": "CreateParagraphBulletsRequest"
        },
        "replaceNamedRangeContent": {
          "description": "Replaces the content in a named range.",
          "$ref": "ReplaceNamedRangeContentRequest"
        },
        "insertPerson": {
          "$ref": "InsertPersonRequest",
          "description": "Inserts a person mention."
        },
        "deleteTab": {
          "description": "Deletes a document tab.",
          "$ref": "DeleteTabRequest"
        },
        "addDocumentTab": {
          "description": "Adds a document tab.",
          "$ref": "AddDocumentTabRequest"
        },
        "createFooter": {
          "description": "Creates a footer.",
          "$ref": "CreateFooterRequest"
        }
      },
      "description": "A single update to apply to a document."
    },
    "UnmergeTableCellsRequest": {
      "id": "UnmergeTableCellsRequest",
      "properties": {
        "tableRange": {
          "$ref": "TableRange",
          "description": "The table range specifying which cells of the table to unmerge. All merged cells in this range will be unmerged, and cells that are already unmerged will not be affected. If the range has no merged cells, the request will do nothing. If there is text in any of the merged cells, the text will remain in the \"head\" cell of the resulting block of unmerged cells. The \"head\" cell is the upper-left cell when the content direction is from left to right, and the upper-right otherwise."
        }
      },
      "description": "Unmerges cells in a Table.",
      "type": "object"
    },
    "UpdateSectionStyleRequest": {
      "properties": {
        "fields": {
          "description": "The fields that should be updated. At least one field must be specified. The root `section_style` is implied and must not be specified. A single `\"*\"` can be used as short-hand for listing every field. For example to update the left margin, set `fields` to `\"margin_left\"`.",
          "type": "string",
          "format": "google-fieldmask"
        },
        "sectionStyle": {
          "$ref": "SectionStyle",
          "description": "The styles to be set on the section. Certain section style changes may cause other changes in order to mirror the behavior of the Docs editor. See the documentation of SectionStyle for more information."
        },
        "range": {
          "description": "The range overlapping the sections to style. Because section breaks can only be inserted inside the body, the segment ID field must be empty.",
          "$ref": "Range"
        }
      },
      "type": "object",
      "description": "Updates the SectionStyle.",
      "id": "UpdateSectionStyleRequest"
    },
    "UpdateParagraphStyleRequest": {
      "id": "UpdateParagraphStyleRequest",
      "description": "Update the styling of all paragraphs that overlap with the given range.",
      "properties": {
        "range": {
          "description": "The range overlapping the paragraphs to style.",
          "$ref": "Range"
        },
        "fields": {
          "description": "The fields that should be updated. At least one field must be specified. The root `paragraph_style` is implied and should not be specified. A single `\"*\"` can be used as short-hand for listing every field. For example, to update the paragraph style's alignment property, set `fields` to `\"alignment\"`. To reset a property to its default value, include its field name in the field mask but leave the field itself unset.",
          "format": "google-fieldmask",
          "type": "string"
        },
        "paragraphStyle": {
          "$ref": "ParagraphStyle",
          "description": "The styles to set on the paragraphs. Certain paragraph style changes may cause other changes in order to mirror the behavior of the Docs editor. See the documentation of ParagraphStyle for more information."
        }
      },
      "type": "object"
    },
    "Document": {
      "type": "object",
      "description": "A Google Docs document.",
      "id": "Document",
      "properties": {
        "lists": {
          "additionalProperties": {
            "$ref": "List"
          },
          "type": "object",
          "description": "Output only. The lists in the document, keyed by list ID. Legacy field: Instead, use Document.tabs.documentTab.lists, which exposes the actual document content from all tabs when the includeTabsContent parameter is set to `true`. If `false` or unset, this field contains information about the first tab in the document."
        },
        "inlineObjects": {
          "description": "Output only. The inline objects in the document, keyed by object ID. Legacy field: Instead, use Document.tabs.documentTab.inlineObjects, which exposes the actual document content from all tabs when the includeTabsContent parameter is set to `true`. If `false` or unset, this field contains information about the first tab in the document.",
          "type": "object",
          "additionalProperties": {
            "$ref": "InlineObject"
          }
        },
        "documentStyle": {
          "$ref": "DocumentStyle",
          "description": "Output only. The style of the document. Legacy field: Instead, use Document.tabs.documentTab.documentStyle, which exposes the actual document content from all tabs when the includeTabsContent parameter is set to `true`. If `false` or unset, this field contains information about the first tab in the document."
        },
        "suggestionsViewMode": {
          "description": "Output only. The suggestions view mode applied to the document. Note: When editing a document, changes must be based on a document with SUGGESTIONS_INLINE.",
          "enumDescriptions": [
            "The SuggestionsViewMode applied to the returned document depends on the user's current access level. If the user only has view access, PREVIEW_WITHOUT_SUGGESTIONS is applied. Otherwise, SUGGESTIONS_INLINE is applied. This is the default suggestions view mode.",
            "The returned document has suggestions inline. Suggested changes will be differentiated from base content within the document. Requests to retrieve a document using this mode will return a 403 error if the user does not have permission to view suggested changes.",
            "The returned document is a preview with all suggested changes accepted. Requests to retrieve a document using this mode will return a 403 error if the user does not have permission to view suggested changes.",
            "The returned document is a preview with all suggested changes rejected if there are any suggestions in the document."
          ],
          "type": "string",
          "enum": [
            "DEFAULT_FOR_CURRENT_ACCESS",
            "SUGGESTIONS_INLINE",
            "PREVIEW_SUGGESTIONS_ACCEPTED",
            "PREVIEW_WITHOUT_SUGGESTIONS"
          ]
        },
        "suggestedNamedStylesChanges": {
          "description": "Output only. The suggested changes to the named styles of the document, keyed by suggestion ID. Legacy field: Instead, use Document.tabs.documentTab.suggestedNamedStylesChanges, which exposes the actual document content from all tabs when the includeTabsContent parameter is set to `true`. If `false` or unset, this field contains information about the first tab in the document.",
          "type": "object",
          "additionalProperties": {
            "$ref": "SuggestedNamedStyles"
          }
        },
        "body": {
          "$ref": "Body",
          "description": "Output only. The main body of the document. Legacy field: Instead, use Document.tabs.documentTab.body, which exposes the actual document content from all tabs when the includeTabsContent parameter is set to `true`. If `false` or unset, this field contains information about the first tab in the document."
        },
        "title": {
          "type": "string",
          "description": "The title of the document."
        },
        "footnotes": {
          "description": "Output only. The footnotes in the document, keyed by footnote ID. Legacy field: Instead, use Document.tabs.documentTab.footnotes, which exposes the actual document content from all tabs when the includeTabsContent parameter is set to `true`. If `false` or unset, this field contains information about the first tab in the document.",
          "additionalProperties": {
            "$ref": "Footnote"
          },
          "type": "object"
        },
        "footers": {
          "type": "object",
          "additionalProperties": {
            "$ref": "Footer"
          },
          "description": "Output only. The footers in the document, keyed by footer ID. Legacy field: Instead, use Document.tabs.documentTab.footers, which exposes the actual document content from all tabs when the includeTabsContent parameter is set to `true`. If `false` or unset, this field contains information about the first tab in the document."
        },
        "documentId": {
          "type": "string",
          "description": "Output only. The ID of the document."
        },
        "headers": {
          "additionalProperties": {
            "$ref": "Header"
          },
          "type": "object",
          "description": "Output only. The headers in the document, keyed by header ID. Legacy field: Instead, use Document.tabs.documentTab.headers, which exposes the actual document content from all tabs when the includeTabsContent parameter is set to `true`. If `false` or unset, this field contains information about the first tab in the document."
        },
        "positionedObjects": {
          "type": "object",
          "description": "Output only. The positioned objects in the document, keyed by object ID. Legacy field: Instead, use Document.tabs.documentTab.positionedObjects, which exposes the actual document content from all tabs when the includeTabsContent parameter is set to `true`. If `false` or unset, this field contains information about the first tab in the document.",
          "additionalProperties": {
            "$ref": "PositionedObject"
          }
        },
        "tabs": {
          "type": "array",
          "description": "Output only. Tabs that are part of a document. Tabs can contain child tabs, a tab nested within another tab. Child tabs are represented by the Tab.childTabs field.",
          "items": {
            "$ref": "Tab"
          }
        },
        "revisionId": {
          "type": "string",
          "description": "Output only. The revision ID of the document. Can be used in update requests to specify which revision of a document to apply updates to and how the request should behave if the document has been edited since that revision. Only populated if the user has edit access to the document. The revision ID is not a sequential number but an opaque string. The format of the revision ID might change over time. A returned revision ID is only guaranteed to be valid for 24 hours after it has been returned and cannot be shared across users. If the revision ID is unchanged between calls, then the document has not changed. Conversely, a changed ID (for the same document and user) usually means the document has been updated. However, a changed ID can also be due to internal factors such as ID format changes."
        },
        "namedRanges": {
          "description": "Output only. The named ranges in the document, keyed by name. Legacy field: Instead, use Document.tabs.documentTab.namedRanges, which exposes the actual document content from all tabs when the includeTabsContent parameter is set to `true`. If `false` or unset, this field contains information about the first tab in the document.",
          "additionalProperties": {
            "$ref": "NamedRanges"
          },
          "type": "object"
        },
        "suggestedDocumentStyleChanges": {
          "description": "Output only. The suggested changes to the style of the document, keyed by suggestion ID. Legacy field: Instead, use Document.tabs.documentTab.suggestedDocumentStyleChanges, which exposes the actual document content from all tabs when the includeTabsContent parameter is set to `true`. If `false` or unset, this field contains information about the first tab in the document.",
          "additionalProperties": {
            "$ref": "SuggestedDocumentStyle"
          },
          "type": "object"
        },
        "namedStyles": {
          "description": "Output only. The named styles of the document. Legacy field: Instead, use Document.tabs.documentTab.namedStyles, which exposes the actual document content from all tabs when the includeTabsContent parameter is set to `true`. If `false` or unset, this field contains information about the first tab in the document.",
          "$ref": "NamedStyles"
        }
      }
    },
    "Body": {
      "description": "The document body. The body typically contains the full document contents except for headers, footers, and footnotes.",
      "properties": {
        "content": {
          "items": {
            "$ref": "StructuralElement"
          },
          "type": "array",
          "description": "The contents of the body. The indexes for the body's content begin at zero."
        }
      },
      "id": "Body",
      "type": "object"
    },
    "PositionedObject": {
      "description": "An object that's tethered to a Paragraph and positioned relative to the beginning of the paragraph. A PositionedObject contains an EmbeddedObject such as an image.",
      "properties": {
        "objectId": {
          "description": "The ID of this positioned object.",
          "type": "string"
        },
        "suggestedInsertionId": {
          "description": "The suggested insertion ID. If empty, then this is not a suggested insertion.",
          "type": "string"
        },
        "suggestedPositionedObjectPropertiesChanges": {
          "type": "object",
          "description": "The suggested changes to the positioned object properties, keyed by suggestion ID.",
          "additionalProperties": {
            "$ref": "SuggestedPositionedObjectProperties"
          }
        },
        "positionedObjectProperties": {
          "description": "The properties of this positioned object.",
          "$ref": "PositionedObjectProperties"
        },
        "suggestedDeletionIds": {
          "items": {
            "type": "string"
          },
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content.",
          "type": "array"
        }
      },
      "type": "object",
      "id": "PositionedObject"
    },
    "List": {
      "type": "object",
      "description": "A List represents the list attributes for a group of paragraphs that all belong to the same list. A paragraph that's part of a list has a reference to the list's ID in its bullet.",
      "properties": {
        "suggestedInsertionId": {
          "description": "The suggested insertion ID. If empty, then this is not a suggested insertion.",
          "type": "string"
        },
        "suggestedDeletionIds": {
          "items": {
            "type": "string"
          },
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this list.",
          "type": "array"
        },
        "listProperties": {
          "$ref": "ListProperties",
          "description": "The properties of the list."
        },
        "suggestedListPropertiesChanges": {
          "description": "The suggested changes to the list properties, keyed by suggestion ID.",
          "type": "object",
          "additionalProperties": {
            "$ref": "SuggestedListProperties"
          }
        }
      },
      "id": "List"
    },
    "SuggestedListProperties": {
      "id": "SuggestedListProperties",
      "type": "object",
      "properties": {
        "listProperties": {
          "$ref": "ListProperties",
          "description": "A ListProperties that only includes the changes made in this suggestion. This can be used along with the list_properties_suggestion_state to see which fields have changed and their new values."
        },
        "listPropertiesSuggestionState": {
          "$ref": "ListPropertiesSuggestionState",
          "description": "A mask that indicates which of the fields on the base ListProperties have been changed in this suggestion."
        }
      },
      "description": "A suggested change to ListProperties."
    },
    "PositionedObjectProperties": {
      "description": "Properties of a PositionedObject.",
      "id": "PositionedObjectProperties",
      "properties": {
        "positioning": {
          "description": "The positioning of this positioned object relative to the newline of the Paragraph that references this positioned object.",
          "$ref": "PositionedObjectPositioning"
        },
        "embeddedObject": {
          "description": "The embedded object of this positioned object.",
          "$ref": "EmbeddedObject"
        }
      },
      "type": "object"
    },
    "InsertTableRowRequest": {
      "description": "Inserts an empty row into a table.",
      "properties": {
        "insertBelow": {
          "description": "Whether to insert new row below the reference cell location. - `True`: insert below the cell. - `False`: insert above the cell.",
          "type": "boolean"
        },
        "tableCellLocation": {
          "description": "The reference table cell location from which rows will be inserted. A new row will be inserted above (or below) the row where the reference cell is. If the reference cell is a merged cell, a new row will be inserted above (or below) the merged cell.",
          "$ref": "TableCellLocation"
        }
      },
      "id": "InsertTableRowRequest",
      "type": "object"
    },
    "DeleteHeaderRequest": {
      "type": "object",
      "description": "Deletes a Header from the document.",
      "properties": {
        "headerId": {
          "description": "The id of the header to delete. If this header is defined on DocumentStyle, the reference to this header is removed, resulting in no header of that type for the first section of the document. If this header is defined on a SectionStyle, the reference to this header is removed and the header of that type is now continued from the previous section.",
          "type": "string"
        },
        "tabId": {
          "description": "The tab containing the header to delete. When omitted, the request is applied to the first tab. In a document containing a single tab: - If provided, must match the singular tab's ID. - If omitted, the request applies to the singular tab. In a document containing multiple tabs: - If provided, the request applies to the specified tab. - If omitted, the request applies to the first tab in the document.",
          "type": "string"
        }
      },
      "id": "DeleteHeaderRequest"
    },
    "DeleteFooterRequest": {
      "properties": {
        "tabId": {
          "type": "string",
          "description": "The tab that contains the footer to delete. When omitted, the request is applied to the first tab. In a document containing a single tab: - If provided, must match the singular tab's ID. - If omitted, the request applies to the singular tab. In a document containing multiple tabs: - If provided, the request applies to the specified tab. - If omitted, the request applies to the first tab in the document."
        },
        "footerId": {
          "description": "The id of the footer to delete. If this footer is defined on DocumentStyle, the reference to this footer is removed, resulting in no footer of that type for the first section of the document. If this footer is defined on a SectionStyle, the reference to this footer is removed and the footer of that type is now continued from the previous section.",
          "type": "string"
        }
      },
      "description": "Deletes a Footer from the document.",
      "type": "object",
      "id": "DeleteFooterRequest"
    },
    "ParagraphStyle": {
      "description": "Styles that apply to a whole paragraph. Inherited paragraph styles are represented as unset fields in this message. A paragraph style's parent depends on where the paragraph style is defined: * The ParagraphStyle on a Paragraph inherits from the paragraph's corresponding named style type. * The ParagraphStyle on a named style inherits from the normal text named style. * The ParagraphStyle of the normal text named style inherits from the default paragraph style in the Docs editor. * The ParagraphStyle on a Paragraph element that's contained in a table may inherit its paragraph style from the table style. If the paragraph style does not inherit from a parent, unsetting fields will revert the style to a value matching the defaults in the Docs editor.",
      "properties": {
        "lineSpacing": {
          "description": "The amount of space between lines, as a percentage of normal, where normal is represented as 100.0. If unset, the value is inherited from the parent.",
          "type": "number",
          "format": "float"
        },
        "spaceBelow": {
          "$ref": "Dimension",
          "description": "The amount of extra space below the paragraph. If unset, the value is inherited from the parent."
        },
        "borderBetween": {
          "$ref": "ParagraphBorder",
          "description": "The border between this paragraph and the next and previous paragraphs. If unset, the value is inherited from the parent. The between border is rendered when the adjacent paragraph has the same border and indent properties. Paragraph borders cannot be partially updated. When changing a paragraph border, the new border must be specified in its entirety."
        },
        "alignment": {
          "enumDescriptions": [
            "The paragraph alignment is inherited from the parent.",
            "The paragraph is aligned to the start of the line. Left-aligned for LTR text, right-aligned otherwise.",
            "The paragraph is centered.",
            "The paragraph is aligned to the end of the line. Right-aligned for LTR text, left-aligned otherwise.",
            "The paragraph is justified."
          ],
          "description": "The text alignment for this paragraph.",
          "type": "string",
          "enum": [
            "ALIGNMENT_UNSPECIFIED",
            "START",
            "CENTER",
            "END",
            "JUSTIFIED"
          ]
        },
        "namedStyleType": {
          "description": "The named style type of the paragraph. Since updating the named style type affects other properties within ParagraphStyle, the named style type is applied before the other properties are updated.",
          "enumDescriptions": [
            "The type of named style is unspecified.",
            "Normal text.",
            "Title.",
            "Subtitle.",
            "Heading 1.",
            "Heading 2.",
            "Heading 3.",
            "Heading 4.",
            "Heading 5.",
            "Heading 6."
          ],
          "type": "string",
          "enum": [
            "NAMED_STYLE_TYPE_UNSPECIFIED",
            "NORMAL_TEXT",
            "TITLE",
            "SUBTITLE",
            "HEADING_1",
            "HEADING_2",
            "HEADING_3",
            "HEADING_4",
            "HEADING_5",
            "HEADING_6"
          ]
        },
        "avoidWidowAndOrphan": {
          "description": "Whether to avoid widows and orphans for the paragraph. If unset, the value is inherited from the parent.",
          "type": "boolean"
        },
        "borderRight": {
          "description": "The border to the right of this paragraph. If unset, the value is inherited from the parent. Paragraph borders cannot be partially updated. When changing a paragraph border, the new border must be specified in its entirety.",
          "$ref": "ParagraphBorder"
        },
        "shading": {
          "description": "The shading of the paragraph. If unset, the value is inherited from the parent.",
          "$ref": "Shading"
        },
        "keepLinesTogether": {
          "type": "boolean",
          "description": "Whether all lines of the paragraph should be laid out on the same page or column if possible. If unset, the value is inherited from the parent."
        },
        "headingId": {
          "type": "string",
          "description": "The heading ID of the paragraph. If empty, then this paragraph is not a heading. This property is read-only."
        },
        "borderTop": {
          "description": "The border at the top of this paragraph. If unset, the value is inherited from the parent. The top border is rendered when the paragraph above has different border and indent properties. Paragraph borders cannot be partially updated. When changing a paragraph border, the new border must be specified in its entirety.",
          "$ref": "ParagraphBorder"
        },
        "spacingMode": {
          "enumDescriptions": [
            "The spacing mode is inherited from the parent.",
            "Paragraph spacing is always rendered.",
            "Paragraph spacing is skipped between list elements."
          ],
          "description": "The spacing mode for the paragraph.",
          "type": "string",
          "enum": [
            "SPACING_MODE_UNSPECIFIED",
            "NEVER_COLLAPSE",
            "COLLAPSE_LISTS"
          ]
        },
        "direction": {
          "type": "string",
          "enum": [
            "CONTENT_DIRECTION_UNSPECIFIED",
            "LEFT_TO_RIGHT",
            "RIGHT_TO_LEFT"
          ],
          "description": "The text direction of this paragraph. If unset, the value defaults to LEFT_TO_RIGHT since paragraph direction is not inherited.",
          "enumDescriptions": [
            "The content direction is unspecified.",
            "The content goes from left to right.",
            "The content goes from right to left."
          ]
        },
        "indentStart": {
          "description": "The amount of indentation for the paragraph on the side that corresponds to the start of the text, based on the current paragraph direction. If unset, the value is inherited from the parent.",
          "$ref": "Dimension"
        },
        "borderBottom": {
          "$ref": "ParagraphBorder",
          "description": "The border at the bottom of this paragraph. If unset, the value is inherited from the parent. The bottom border is rendered when the paragraph below has different border and indent properties. Paragraph borders cannot be partially updated. When changing a paragraph border, the new border must be specified in its entirety."
        },
        "indentFirstLine": {
          "description": "The amount of indentation for the first line of the paragraph. If unset, the value is inherited from the parent.",
          "$ref": "Dimension"
        },
        "indentEnd": {
          "description": "The amount of indentation for the paragraph on the side that corresponds to the end of the text, based on the current paragraph direction. If unset, the value is inherited from the parent.",
          "$ref": "Dimension"
        },
        "keepWithNext": {
          "type": "boolean",
          "description": "Whether at least a part of this paragraph should be laid out on the same page or column as the next paragraph if possible. If unset, the value is inherited from the parent."
        },
        "pageBreakBefore": {
          "type": "boolean",
          "description": "Whether the current paragraph should always start at the beginning of a page. If unset, the value is inherited from the parent. Attempting to update page_break_before for paragraphs in unsupported regions, including Table, Header, Footer and Footnote, can result in an invalid document state that returns a 400 bad request error."
        },
        "spaceAbove": {
          "$ref": "Dimension",
          "description": "The amount of extra space above the paragraph. If unset, the value is inherited from the parent."
        },
        "borderLeft": {
          "description": "The border to the left of this paragraph. If unset, the value is inherited from the parent. Paragraph borders cannot be partially updated. When changing a paragraph border, the new border must be specified in its entirety.",
          "$ref": "ParagraphBorder"
        },
        "tabStops": {
          "type": "array",
          "items": {
            "$ref": "TabStop"
          },
          "description": "A list of the tab stops for this paragraph. The list of tab stops is not inherited. This property is read-only."
        }
      },
      "id": "ParagraphStyle",
      "type": "object"
    },
    "MergeTableCellsRequest": {
      "description": "Merges cells in a Table.",
      "id": "MergeTableCellsRequest",
      "properties": {
        "tableRange": {
          "description": "The table range specifying which cells of the table to merge. Any text in the cells being merged will be concatenated and stored in the \"head\" cell of the range. This is the upper-left cell of the range when the content direction is left to right, and the upper-right cell of the range otherwise. If the range is non-rectangular (which can occur in some cases where the range covers cells that are already merged or where the table is non-rectangular), a 400 bad request error is returned.",
          "$ref": "TableRange"
        }
      },
      "type": "object"
    },
    "SectionStyle": {
      "type": "object",
      "id": "SectionStyle",
      "properties": {
        "defaultFooterId": {
          "description": "The ID of the default footer. If unset, the value inherits from the previous SectionBreak's SectionStyle. If the value is unset in the first SectionBreak, it inherits from DocumentStyle's default_footer_id. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only.",
          "type": "string"
        },
        "marginRight": {
          "$ref": "Dimension",
          "description": "The right page margin of the section. If unset, the value defaults to margin_right from DocumentStyle. Updating the right margin causes columns in this section to resize. Since the margin affects column width, it's applied before column properties. If DocumentMode is PAGELESS, this property will not be rendered. When updating this property, setting a concrete value is required. Unsetting this property results in a 400 bad request error."
        },
        "useFirstPageHeaderFooter": {
          "type": "boolean",
          "description": "Indicates whether to use the first page header / footer IDs for the first page of the section. If unset, it inherits from DocumentStyle's use_first_page_header_footer for the first section. If the value is unset for subsequent sectors, it should be interpreted as false. If DocumentMode is PAGELESS, this property will not be rendered. When updating this property, setting a concrete value is required. Unsetting this property results in a 400 bad request error."
        },
        "marginLeft": {
          "$ref": "Dimension",
          "description": "The left page margin of the section. If unset, the value defaults to margin_left from DocumentStyle. Updating the left margin causes columns in this section to resize. Since the margin affects column width, it's applied before column properties. If DocumentMode is PAGELESS, this property will not be rendered. When updating this property, setting a concrete value is required. Unsetting this property results in a 400 bad request error."
        },
        "evenPageFooterId": {
          "description": "The ID of the footer used only for even pages. If the value of DocumentStyle's use_even_page_header_footer is true, this value is used for the footers on even pages in the section. If it is false, the footers on even pages use the default_footer_id. If unset, the value inherits from the previous SectionBreak's SectionStyle. If the value is unset in the first SectionBreak, it inherits from DocumentStyle's even_page_footer_id. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only.",
          "type": "string"
        },
        "evenPageHeaderId": {
          "type": "string",
          "description": "The ID of the header used only for even pages. If the value of DocumentStyle's use_even_page_header_footer is true, this value is used for the headers on even pages in the section. If it is false, the headers on even pages use the default_header_id. If unset, the value inherits from the previous SectionBreak's SectionStyle. If the value is unset in the first SectionBreak, it inherits from DocumentStyle's even_page_header_id. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only."
        },
        "firstPageHeaderId": {
          "description": "The ID of the header used only for the first page of the section. If use_first_page_header_footer is true, this value is used for the header on the first page of the section. If it's false, the header on the first page of the section uses the default_header_id. If unset, the value inherits from the previous SectionBreak's SectionStyle. If the value is unset in the first SectionBreak, it inherits from DocumentStyle's first_page_header_id. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only.",
          "type": "string"
        },
        "flipPageOrientation": {
          "type": "boolean",
          "description": "Optional. Indicates whether to flip the dimensions of DocumentStyle's page_size for this section, which allows changing the page orientation between portrait and landscape. If unset, the value inherits from DocumentStyle's flip_page_orientation. If DocumentMode is PAGELESS, this property will not be rendered. When updating this property, setting a concrete value is required. Unsetting this property results in a 400 bad request error."
        },
        "defaultHeaderId": {
          "type": "string",
          "description": "The ID of the default header. If unset, the value inherits from the previous SectionBreak's SectionStyle. If the value is unset in the first SectionBreak, it inherits from DocumentStyle's default_header_id. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only."
        },
        "sectionType": {
          "description": "Output only. The type of section.",
          "type": "string",
          "enum": [
            "SECTION_TYPE_UNSPECIFIED",
            "CONTINUOUS",
            "NEXT_PAGE"
          ],
          "enumDescriptions": [
            "The section type is unspecified.",
            "The section starts immediately after the last paragraph of the previous section.",
            "The section starts on the next page."
          ]
        },
        "pageNumberStart": {
          "format": "int32",
          "description": "The page number from which to start counting the number of pages for this section. If unset, page numbering continues from the previous section. If the value is unset in the first SectionBreak, refer to DocumentStyle's page_number_start. If DocumentMode is PAGELESS, this property will not be rendered. When updating this property, setting a concrete value is required. Unsetting this property results in a 400 bad request error.",
          "type": "integer"
        },
        "firstPageFooterId": {
          "description": "The ID of the footer used only for the first page of the section. If use_first_page_header_footer is true, this value is used for the footer on the first page of the section. If it's false, the footer on the first page of the section uses the default_footer_id. If unset, the value inherits from the previous SectionBreak's SectionStyle. If the value is unset in the first SectionBreak, it inherits from DocumentStyle's first_page_footer_id. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only.",
          "type": "string"
        },
        "contentDirection": {
          "enumDescriptions": [
            "The content direction is unspecified.",
            "The content goes from left to right.",
            "The content goes from right to left."
          ],
          "type": "string",
          "enum": [
            "CONTENT_DIRECTION_UNSPECIFIED",
            "LEFT_TO_RIGHT",
            "RIGHT_TO_LEFT"
          ],
          "description": "The content direction of this section. If unset, the value defaults to LEFT_TO_RIGHT. When updating this property, setting a concrete value is required. Unsetting this property results in a 400 bad request error."
        },
        "marginHeader": {
          "$ref": "Dimension",
          "description": "The header margin of the section. If unset, the value defaults to margin_header from DocumentStyle. If updated, use_custom_header_footer_margins is set to true on DocumentStyle. The value of use_custom_header_footer_margins on DocumentStyle indicates if a header margin is being respected for this section. If DocumentMode is PAGELESS, this property will not be rendered. When updating this property, setting a concrete value is required. Unsetting this property results in a 400 bad request error."
        },
        "columnProperties": {
          "type": "array",
          "items": {
            "$ref": "SectionColumnProperties"
          },
          "description": "The section's columns properties. If empty, the section contains one column with the default properties in the Docs editor. A section can be updated to have no more than 3 columns. When updating this property, setting a concrete value is required. Unsetting this property will result in a 400 bad request error."
        },
        "marginFooter": {
          "description": "The footer margin of the section. If unset, the value defaults to margin_footer from DocumentStyle. If updated, use_custom_header_footer_margins is set to true on DocumentStyle. The value of use_custom_header_footer_margins on DocumentStyle indicates if a footer margin is being respected for this section If DocumentMode is PAGELESS, this property will not be rendered. When updating this property, setting a concrete value is required. Unsetting this property results in a 400 bad request error.",
          "$ref": "Dimension"
        },
        "columnSeparatorStyle": {
          "description": "The style of column separators. This style can be set even when there's one column in the section. When updating this property, setting a concrete value is required. Unsetting this property results in a 400 bad request error.",
          "enumDescriptions": [
            "An unspecified column separator style.",
            "No column separator lines between columns.",
            "Renders a column separator line between each column."
          ],
          "type": "string",
          "enum": [
            "COLUMN_SEPARATOR_STYLE_UNSPECIFIED",
            "NONE",
            "BETWEEN_EACH_COLUMN"
          ]
        },
        "marginTop": {
          "$ref": "Dimension",
          "description": "The top page margin of the section. If unset, the value defaults to margin_top from DocumentStyle. If DocumentMode is PAGELESS, this property will not be rendered. When updating this property, setting a concrete value is required. Unsetting this property results in a 400 bad request error."
        },
        "marginBottom": {
          "$ref": "Dimension",
          "description": "The bottom page margin of the section. If unset, the value defaults to margin_bottom from DocumentStyle. If DocumentMode is PAGELESS, this property will not be rendered. When updating this property, setting a concrete value is required. Unsetting this property results in a 400 bad request error."
        }
      },
      "description": "The styling that applies to a section."
    },
    "DeleteTableColumnRequest": {
      "id": "DeleteTableColumnRequest",
      "type": "object",
      "description": "Deletes a column from a table.",
      "properties": {
        "tableCellLocation": {
          "description": "The reference table cell location from which the column will be deleted. The column this cell spans will be deleted. If this is a merged cell that spans multiple columns, all columns that the cell spans will be deleted. If no columns remain in the table after this deletion, the whole table is deleted.",
          "$ref": "TableCellLocation"
        }
      }
    },
    "InsertPersonRequest": {
      "properties": {
        "personProperties": {
          "description": "The properties of the person mention to insert.",
          "$ref": "PersonProperties"
        },
        "location": {
          "$ref": "Location",
          "description": "Inserts the person mention at a specific index in the document. The person mention must be inserted inside the bounds of an existing Paragraph. For instance, it cannot be inserted at a table's start index (i.e. between the table and its preceding paragraph). Person mentions cannot be inserted inside an equation."
        },
        "endOfSegmentLocation": {
          "description": "Inserts the person mention at the end of a header, footer, footnote or the document body.",
          "$ref": "EndOfSegmentLocation"
        }
      },
      "description": "Inserts a person mention.",
      "type": "object",
      "id": "InsertPersonRequest"
    },
    "PersonProperties": {
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the person if it's displayed in the link text instead of the person's email address."
        },
        "email": {
          "type": "string",
          "description": "The email address linked to this Person. This field is always present."
        }
      },
      "id": "PersonProperties",
      "description": "Properties specific to a linked Person.",
      "type": "object"
    },
    "Location": {
      "description": "A particular location in the document.",
      "properties": {
        "index": {
          "description": "The zero-based index, in UTF-16 code units. The index is relative to the beginning of the segment specified by segment_id.",
          "format": "int32",
          "type": "integer"
        },
        "segmentId": {
          "description": "The ID of the header, footer or footnote the location is in. An empty segment ID signifies the document's body.",
          "type": "string"
        },
        "tabId": {
          "type": "string",
          "description": "The tab that the location is in. When omitted, the request is applied to the first tab. In a document containing a single tab: - If provided, must match the singular tab's ID. - If omitted, the request applies to the singular tab. In a document containing multiple tabs: - If provided, the request applies to the specified tab. - If omitted, the request applies to the first tab in the document."
        }
      },
      "id": "Location",
      "type": "object"
    },
    "Header": {
      "type": "object",
      "description": "A document header.",
      "id": "Header",
      "properties": {
        "content": {
          "items": {
            "$ref": "StructuralElement"
          },
          "description": "The contents of the header. The indexes for a header's content begin at zero.",
          "type": "array"
        },
        "headerId": {
          "type": "string",
          "description": "The ID of the header."
        }
      }
    },
    "DeleteTabRequest": {
      "description": "Deletes a tab. If the tab has child tabs, they are deleted as well.",
      "id": "DeleteTabRequest",
      "properties": {
        "tabId": {
          "description": "The ID of the tab to delete.",
          "type": "string"
        }
      },
      "type": "object"
    },
    "TableCellLocation": {
      "type": "object",
      "description": "Location of a single cell within a table.",
      "id": "TableCellLocation",
      "properties": {
        "tableStartLocation": {
          "description": "The location where the table starts in the document.",
          "$ref": "Location"
        },
        "columnIndex": {
          "format": "int32",
          "type": "integer",
          "description": "The zero-based column index. For example, the second column in the table has a column index of 1."
        },
        "rowIndex": {
          "type": "integer",
          "format": "int32",
          "description": "The zero-based row index. For example, the second row in the table has a row index of 1."
        }
      }
    },
    "ReplaceImageRequest": {
      "type": "object",
      "properties": {
        "imageObjectId": {
          "type": "string",
          "description": "The ID of the existing image that will be replaced. The ID can be retrieved from the response of a get request."
        },
        "imageReplaceMethod": {
          "type": "string",
          "enum": [
            "IMAGE_REPLACE_METHOD_UNSPECIFIED",
            "CENTER_CROP"
          ],
          "enumDescriptions": [
            "Unspecified image replace method. This value must not be used.",
            "Scales and centers the image to fill the bounds of the original image. The image may be cropped in order to fill the original image's bounds. The rendered size of the image will be the same as the original image."
          ],
          "description": "The replacement method."
        },
        "uri": {
          "description": "The URI of the new image. The image is fetched once at insertion time and a copy is stored for display inside the document. Images must be less than 50MB, cannot exceed 25 megapixels, and must be in PNG, JPEG, or GIF format. The provided URI can't surpass 2 KB in length. The URI is saved with the image, and exposed through the ImageProperties.source_uri field.",
          "type": "string"
        },
        "tabId": {
          "type": "string",
          "description": "The tab that the image to be replaced is in. When omitted, the request is applied to the first tab. In a document containing a single tab: - If provided, must match the singular tab's ID. - If omitted, the request applies to the singular tab. In a document containing multiple tabs: - If provided, the request applies to the specified tab. - If omitted, the request applies to the first tab in the document."
        }
      },
      "id": "ReplaceImageRequest",
      "description": "Replaces an existing image with a new image. Replacing an image removes some image effects from the existing image in order to mirror the behavior of the Docs editor."
    },
    "UpdateDocumentTabPropertiesRequest": {
      "description": "Update the properties of a document tab.",
      "properties": {
        "tabProperties": {
          "$ref": "TabProperties",
          "description": "The tab properties to update."
        },
        "fields": {
          "type": "string",
          "description": "The fields that should be updated. At least one field must be specified. The root `tab_properties` is implied and should not be specified. A single `\"*\"` can be used as short-hand for listing every field.",
          "format": "google-fieldmask"
        }
      },
      "id": "UpdateDocumentTabPropertiesRequest",
      "type": "object"
    },
    "TabProperties": {
      "id": "TabProperties",
      "properties": {
        "index": {
          "description": "The zero-based index of the tab within the parent.",
          "type": "integer",
          "format": "int32"
        },
        "parentTabId": {
          "type": "string",
          "description": "Optional. The ID of the parent tab. Empty when the current tab is a root-level tab, which means it doesn't have any parents."
        },
        "nestingLevel": {
          "type": "integer",
          "description": "Output only. The depth of the tab within the document. Root-level tabs start at 0.",
          "format": "int32"
        },
        "title": {
          "type": "string",
          "description": "The user-visible name of the tab."
        },
        "iconEmoji": {
          "type": "string",
          "description": "Optional. The emoji icon displayed with the tab. A valid emoji icon is represented by a non-empty Unicode string. Any set of characters that don't represent a single emoji is invalid. If an emoji is invalid, a 400 bad request error is returned. If this value is unset or empty, the tab will display the default tab icon."
        },
        "tabId": {
          "description": "The immutable ID of the tab.",
          "type": "string"
        }
      },
      "type": "object",
      "description": "Properties of a tab."
    },
    "EmbeddedObject": {
      "id": "EmbeddedObject",
      "type": "object",
      "description": "An embedded object in the document.",
      "properties": {
        "size": {
          "description": "The visible size of the image after cropping.",
          "$ref": "Size"
        },
        "linkedContentReference": {
          "$ref": "LinkedContentReference",
          "description": "A reference to the external linked source content. For example, it contains a reference to the source Google Sheets chart when the embedded object is a linked chart. If unset, then the embedded object is not linked."
        },
        "title": {
          "description": "The title of the embedded object. The `title` and `description` are both combined to display alt text.",
          "type": "string"
        },
        "marginBottom": {
          "description": "The bottom margin of the embedded object.",
          "$ref": "Dimension"
        },
        "marginTop": {
          "$ref": "Dimension",
          "description": "The top margin of the embedded object."
        },
        "description": {
          "type": "string",
          "description": "The description of the embedded object. The `title` and `description` are both combined to display alt text."
        },
        "imageProperties": {
          "$ref": "ImageProperties",
          "description": "The properties of an image."
        },
        "marginRight": {
          "$ref": "Dimension",
          "description": "The right margin of the embedded object."
        },
        "marginLeft": {
          "description": "The left margin of the embedded object.",
          "$ref": "Dimension"
        },
        "embeddedObjectBorder": {
          "description": "The border of the embedded object.",
          "$ref": "EmbeddedObjectBorder"
        },
        "embeddedDrawingProperties": {
          "$ref": "EmbeddedDrawingProperties",
          "description": "The properties of an embedded drawing."
        }
      }
    },
    "LinkedContentReference": {
      "description": "A reference to the external linked source content.",
      "type": "object",
      "properties": {
        "sheetsChartReference": {
          "description": "A reference to the linked chart.",
          "$ref": "SheetsChartReference"
        }
      },
      "id": "LinkedContentReference"
    },
    "SheetsChartReference": {
      "properties": {
        "chartId": {
          "type": "integer",
          "description": "The ID of the specific chart in the Google Sheets spreadsheet that's embedded.",
          "format": "int32"
        },
        "spreadsheetId": {
          "description": "The ID of the Google Sheets spreadsheet that contains the source chart.",
          "type": "string"
        }
      },
      "type": "object",
      "description": "A reference to a linked chart embedded from Google Sheets.",
      "id": "SheetsChartReference"
    },
    "ImageProperties": {
      "properties": {
        "sourceUri": {
          "description": "The source URI is the URI used to insert the image. The source URI can be empty.",
          "type": "string"
        },
        "transparency": {
          "format": "float",
          "description": "The transparency effect of the image. The value should be in the interval [0.0, 1.0], where 0 means no effect and 1 means transparent.",
          "type": "number"
        },
        "contrast": {
          "type": "number",
          "description": "The contrast effect of the image. The value should be in the interval [-1.0, 1.0], where 0 means no effect.",
          "format": "float"
        },
        "angle": {
          "description": "The clockwise rotation angle of the image, in radians.",
          "format": "float",
          "type": "number"
        },
        "contentUri": {
          "type": "string",
          "description": "A URI to the image with a default lifetime of 30 minutes. This URI is tagged with the account of the requester. Anyone with the URI effectively accesses the image as the original requester. Access to the image may be lost if the document's sharing settings change."
        },
        "brightness": {
          "format": "float",
          "description": "The brightness effect of the image. The value should be in the interval [-1.0, 1.0], where 0 means no effect.",
          "type": "number"
        },
        "cropProperties": {
          "$ref": "CropProperties",
          "description": "The crop properties of the image."
        }
      },
      "description": "The properties of an image.",
      "id": "ImageProperties",
      "type": "object"
    },
    "EmbeddedDrawingProperties": {
      "id": "EmbeddedDrawingProperties",
      "description": "The properties of an embedded drawing and used to differentiate the object type. An embedded drawing is one that's created and edited within a document. Note that extensive details are not supported.",
      "properties": {},
      "type": "object"
    },
    "EmbeddedObjectBorder": {
      "properties": {
        "propertyState": {
          "type": "string",
          "enum": [
            "RENDERED",
            "NOT_RENDERED"
          ],
          "description": "The property state of the border property.",
          "enumDescriptions": [
            "If a property's state is RENDERED, then the element has the corresponding property when rendered in the document. This is the default value.",
            "If a property's state is NOT_RENDERED, then the element does not have the corresponding property when rendered in the document."
          ]
        },
        "dashStyle": {
          "description": "The dash style of the border.",
          "enumDescriptions": [
            "Unspecified dash style.",
            "Solid line. Corresponds to ECMA-376 ST_PresetLineDashVal value 'solid'. This is the default dash style.",
            "Dotted line. Corresponds to ECMA-376 ST_PresetLineDashVal value 'dot'.",
            "Dashed line. Corresponds to ECMA-376 ST_PresetLineDashVal value 'dash'."
          ],
          "type": "string",
          "enum": [
            "DASH_STYLE_UNSPECIFIED",
            "SOLID",
            "DOT",
            "DASH"
          ]
        },
        "color": {
          "description": "The color of the border.",
          "$ref": "OptionalColor"
        },
        "width": {
          "description": "The width of the border.",
          "$ref": "Dimension"
        }
      },
      "type": "object",
      "id": "EmbeddedObjectBorder",
      "description": "A border around an EmbeddedObject."
    },
    "OptionalColor": {
      "id": "OptionalColor",
      "description": "A color that can either be fully opaque or fully transparent.",
      "type": "object",
      "properties": {
        "color": {
          "$ref": "Color",
          "description": "If set, this will be used as an opaque color. If unset, this represents a transparent color."
        }
      }
    },
    "Color": {
      "description": "A solid color.",
      "properties": {
        "rgbColor": {
          "description": "The RGB color value.",
          "$ref": "RgbColor"
        }
      },
      "id": "Color",
      "type": "object"
    },
    "CropProperties": {
      "type": "object",
      "properties": {
        "angle": {
          "format": "float",
          "type": "number",
          "description": "The clockwise rotation angle of the crop rectangle around its center, in radians. Rotation is applied after the offsets."
        },
        "offsetLeft": {
          "format": "float",
          "type": "number",
          "description": "The offset specifies how far inwards the left edge of the crop rectangle is from the left edge of the original content as a fraction of the original content's width."
        },
        "offsetRight": {
          "description": "The offset specifies how far inwards the right edge of the crop rectangle is from the right edge of the original content as a fraction of the original content's width.",
          "type": "number",
          "format": "float"
        },
        "offsetBottom": {
          "description": "The offset specifies how far inwards the bottom edge of the crop rectangle is from the bottom edge of the original content as a fraction of the original content's height.",
          "type": "number",
          "format": "float"
        },
        "offsetTop": {
          "description": "The offset specifies how far inwards the top edge of the crop rectangle is from the top edge of the original content as a fraction of the original content's height.",
          "format": "float",
          "type": "number"
        }
      },
      "description": "The crop properties of an image. The crop rectangle is represented using fractional offsets from the original content's 4 edges. - If the offset is in the interval (0, 1), the corresponding edge of crop rectangle is positioned inside of the image's original bounding rectangle. - If the offset is negative or greater than 1, the corresponding edge of crop rectangle is positioned outside of the image's original bounding rectangle. - If all offsets and rotation angles are 0, the image is not cropped.",
      "id": "CropProperties"
    },
    "RgbColor": {
      "properties": {
        "red": {
          "type": "number",
          "format": "float",
          "description": "The red component of the color, from 0.0 to 1.0."
        },
        "blue": {
          "type": "number",
          "description": "The blue component of the color, from 0.0 to 1.0.",
          "format": "float"
        },
        "green": {
          "type": "number",
          "format": "float",
          "description": "The green component of the color, from 0.0 to 1.0."
        }
      },
      "id": "RgbColor",
      "description": "An RGB color.",
      "type": "object"
    },
    "InsertTextRequest": {
      "id": "InsertTextRequest",
      "description": "Inserts text at the specified location.",
      "type": "object",
      "properties": {
        "endOfSegmentLocation": {
          "$ref": "EndOfSegmentLocation",
          "description": "Inserts the text at the end of a header, footer, footnote or the document body."
        },
        "text": {
          "description": "The text to be inserted. Inserting a newline character will implicitly create a new Paragraph at that index. The paragraph style of the new paragraph will be copied from the paragraph at the current insertion index, including lists and bullets. Text styles for inserted text will be determined automatically, generally preserving the styling of neighboring text. In most cases, the text style for the inserted text will match the text immediately before the insertion index. Some control characters (U+0000-U+0008, U+000C-U+001F) and characters from the Unicode Basic Multilingual Plane Private Use Area (U+E000-U+F8FF) will be stripped out of the inserted text.",
          "type": "string"
        },
        "location": {
          "$ref": "Location",
          "description": "Inserts the text at a specific index in the document. Text must be inserted inside the bounds of an existing Paragraph. For instance, text cannot be inserted at a table's start index (i.e. between the table and its preceding paragraph). The text must be inserted in the preceding paragraph."
        }
      }
    },
    "Footer": {
      "description": "A document footer.",
      "properties": {
        "content": {
          "type": "array",
          "items": {
            "$ref": "StructuralElement"
          },
          "description": "The contents of the footer. The indexes for a footer's content begin at zero."
        },
        "footerId": {
          "type": "string",
          "description": "The ID of the footer."
        }
      },
      "id": "Footer",
      "type": "object"
    },
    "ReplaceAllTextRequest": {
      "type": "object",
      "description": "Replaces all instances of text matching a criteria with replace text.",
      "properties": {
        "replaceText": {
          "description": "The text that will replace the matched text.",
          "type": "string"
        },
        "containsText": {
          "$ref": "SubstringMatchCriteria",
          "description": "Finds text in the document matching this substring."
        },
        "tabsCriteria": {
          "$ref": "TabsCriteria",
          "description": "Optional. The criteria used to specify in which tabs the replacement occurs. When omitted, the replacement applies to all tabs. In a document containing a single tab: - If provided, must match the singular tab's ID. - If omitted, the replacement applies to the singular tab. In a document containing multiple tabs: - If provided, the replacement applies to the specified tabs. - If omitted, the replacement applies to all tabs."
        }
      },
      "id": "ReplaceAllTextRequest"
    },
    "UpdateNamedStyleRequest": {
      "description": "Updates a named style.",
      "type": "object",
      "id": "UpdateNamedStyleRequest",
      "properties": {
        "fields": {
          "format": "google-fieldmask",
          "description": "The NamedStyle fields that should be updated. At least `named_style_type` must be specified. The root `named_style` is implied and should not be specified. A single `\"*\"` can be used as short-hand for listing every field. For example, to update the text style to bold, set `fields` to include `\"text_style\"` and `\"text_style.bold\"`. To update the paragraph style's alignment property, set `fields` to include `\"paragraph_style\"` and `\"paragraph_style.alignment\"`. To reset a property to its default value, include its field name in the field mask but leave the field itself unset. Specifying `\"text_style\"` or `\"paragraph_style\"` with an empty TextStyle or ParagraphStyle will reset all of its nested fields.",
          "type": "string"
        },
        "namedStyle": {
          "description": "The document style to update.",
          "$ref": "NamedStyle"
        },
        "tabId": {
          "type": "string",
          "description": "The document tab to update. By default, the update is applied to the first tab."
        }
      }
    },
    "NamedStyle": {
      "id": "NamedStyle",
      "type": "object",
      "description": "A named style. Paragraphs in the document can inherit their TextStyle and ParagraphStyle from this named style when they have the same named style type.",
      "properties": {
        "namedStyleType": {
          "enumDescriptions": [
            "The type of named style is unspecified.",
            "Normal text.",
            "Title.",
            "Subtitle.",
            "Heading 1.",
            "Heading 2.",
            "Heading 3.",
            "Heading 4.",
            "Heading 5.",
            "Heading 6."
          ],
          "description": "The type of this named style.",
          "type": "string",
          "enum": [
            "NAMED_STYLE_TYPE_UNSPECIFIED",
            "NORMAL_TEXT",
            "TITLE",
            "SUBTITLE",
            "HEADING_1",
            "HEADING_2",
            "HEADING_3",
            "HEADING_4",
            "HEADING_5",
            "HEADING_6"
          ]
        },
        "textStyle": {
          "$ref": "TextStyle",
          "description": "The text style of this named style."
        },
        "paragraphStyle": {
          "$ref": "ParagraphStyle",
          "description": "The paragraph style of this named style."
        }
      }
    },
    "TextStyle": {
      "properties": {
        "fontSize": {
          "$ref": "Dimension",
          "description": "The size of the text's font."
        },
        "strikethrough": {
          "type": "boolean",
          "description": "Whether or not the text is struck through."
        },
        "smallCaps": {
          "type": "boolean",
          "description": "Whether or not the text is in small capital letters."
        },
        "link": {
          "description": "The hyperlink destination of the text. If unset, there's no link. Links are not inherited from parent text. Changing the link in an update request causes some other changes to the text style of the range: * When setting a link, the text foreground color will be updated to the default link color and the text will be underlined. If these fields are modified in the same request, those values will be used instead of the link defaults. * Setting a link on a text range that overlaps with an existing link will also update the existing link to point to the new URL. * Links are not settable on newline characters. As a result, setting a link on a text range that crosses a paragraph boundary, such as `\"ABC\\n123\"`, will separate the newline character(s) into their own text runs. The link will be applied separately to the runs before and after the newline. * Removing a link will update the text style of the range to match the style of the preceding text (or the default text styles if the preceding text is another link) unless different styles are being set in the same request.",
          "$ref": "Link"
        },
        "bold": {
          "description": "Whether or not the text is rendered as bold.",
          "type": "boolean"
        },
        "foregroundColor": {
          "$ref": "OptionalColor",
          "description": "The foreground color of the text. If set, the color is either an RGB color or transparent, depending on the `color` field."
        },
        "weightedFontFamily": {
          "description": "The font family and rendered weight of the text. If an update request specifies values for both `weighted_font_family` and `bold`, the `weighted_font_family` is applied first, then `bold`. If `weighted_font_family#weight` is not set, it defaults to `400`. If `weighted_font_family` is set, then `weighted_font_family#font_family` must also be set with a non-empty value. Otherwise, a 400 bad request error is returned.",
          "$ref": "WeightedFontFamily"
        },
        "baselineOffset": {
          "enumDescriptions": [
            "The text's baseline offset is inherited from the parent.",
            "The text is not vertically offset.",
            "The text is vertically offset upwards (superscript).",
            "The text is vertically offset downwards (subscript)."
          ],
          "description": "The text's vertical offset from its normal position. Text with `SUPERSCRIPT` or `SUBSCRIPT` baseline offsets is automatically rendered in a smaller font size, computed based on the `font_size` field. Changes in this field don't affect the `font_size`.",
          "type": "string",
          "enum": [
            "BASELINE_OFFSET_UNSPECIFIED",
            "NONE",
            "SUPERSCRIPT",
            "SUBSCRIPT"
          ]
        },
        "backgroundColor": {
          "description": "The background color of the text. If set, the color is either an RGB color or transparent, depending on the `color` field.",
          "$ref": "OptionalColor"
        },
        "underline": {
          "type": "boolean",
          "description": "Whether or not the text is underlined."
        },
        "italic": {
          "description": "Whether or not the text is italicized.",
          "type": "boolean"
        }
      },
      "type": "object",
      "id": "TextStyle",
      "description": "Represents the styling that can be applied to text. Inherited text styles are represented as unset fields in this message. A text style's parent depends on where the text style is defined: * The TextStyle of text in a Paragraph inherits from the paragraph's corresponding named style type. * The TextStyle on a named style inherits from the normal text named style. * The TextStyle of the normal text named style inherits from the default text style in the Docs editor. * The TextStyle on a Paragraph element that's contained in a table may inherit its text style from the table style. If the text style does not inherit from a parent, unsetting fields will revert the style to a value matching the defaults in the Docs editor."
    },
    "InlineObject": {
      "properties": {
        "objectId": {
          "description": "The ID of this inline object. Can be used to update an object\u2019s properties.",
          "type": "string"
        },
        "inlineObjectProperties": {
          "$ref": "InlineObjectProperties",
          "description": "The properties of this inline object."
        },
        "suggestedInsertionId": {
          "description": "The suggested insertion ID. If empty, then this is not a suggested insertion.",
          "type": "string"
        },
        "suggestedInlineObjectPropertiesChanges": {
          "description": "The suggested changes to the inline object properties, keyed by suggestion ID.",
          "type": "object",
          "additionalProperties": {
            "$ref": "SuggestedInlineObjectProperties"
          }
        },
        "suggestedDeletionIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content."
        }
      },
      "description": "An object that appears inline with text. An InlineObject contains an EmbeddedObject such as an image.",
      "type": "object",
      "id": "InlineObject"
    },
    "CreateNamedRangeRequest": {
      "description": "Creates a NamedRange referencing the given range.",
      "id": "CreateNamedRangeRequest",
      "properties": {
        "name": {
          "description": "The name of the NamedRange. Names do not need to be unique. Names must be at least 1 character and no more than 256 characters, measured in UTF-16 code units.",
          "type": "string"
        },
        "range": {
          "description": "The range to apply the name to.",
          "$ref": "Range"
        }
      },
      "type": "object"
    },
    "StructuralElement": {
      "type": "object",
      "properties": {
        "endIndex": {
          "type": "integer",
          "format": "int32",
          "description": "The zero-based end index of this structural element, exclusive, in UTF-16 code units."
        },
        "sectionBreak": {
          "description": "A section break type of structural element.",
          "$ref": "SectionBreak"
        },
        "tableOfContents": {
          "description": "A table of contents type of structural element.",
          "$ref": "TableOfContents"
        },
        "startIndex": {
          "description": "The zero-based start index of this structural element, in UTF-16 code units.",
          "type": "integer",
          "format": "int32"
        },
        "table": {
          "description": "A table type of structural element.",
          "$ref": "Table"
        },
        "paragraph": {
          "$ref": "Paragraph",
          "description": "A paragraph type of structural element."
        }
      },
      "description": "A StructuralElement describes content that provides structure to the document.",
      "id": "StructuralElement"
    },
    "Paragraph": {
      "description": "A StructuralElement representing a paragraph. A paragraph is a range of content that's terminated with a newline character.",
      "properties": {
        "elements": {
          "items": {
            "$ref": "ParagraphElement"
          },
          "type": "array",
          "description": "The content of the paragraph, broken down into its component parts."
        },
        "suggestedPositionedObjectIds": {
          "description": "The IDs of the positioned objects suggested to be attached to this paragraph, keyed by suggestion ID.",
          "additionalProperties": {
            "$ref": "ObjectReferences"
          },
          "type": "object"
        },
        "suggestedBulletChanges": {
          "additionalProperties": {
            "$ref": "SuggestedBullet"
          },
          "description": "The suggested changes to this paragraph's bullet.",
          "type": "object"
        },
        "paragraphStyle": {
          "description": "The style of this paragraph.",
          "$ref": "ParagraphStyle"
        },
        "positionedObjectIds": {
          "description": "The IDs of the positioned objects tethered to this paragraph.",
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "bullet": {
          "$ref": "Bullet",
          "description": "The bullet for this paragraph. If not present, the paragraph does not belong to a list."
        },
        "suggestedParagraphStyleChanges": {
          "description": "The suggested paragraph style changes to this paragraph, keyed by suggestion ID.",
          "type": "object",
          "additionalProperties": {
            "$ref": "SuggestedParagraphStyle"
          }
        }
      },
      "id": "Paragraph",
      "type": "object"
    },
    "SuggestedBullet": {
      "properties": {
        "bulletSuggestionState": {
          "description": "A mask that indicates which of the fields on the base Bullet have been changed in this suggestion.",
          "$ref": "BulletSuggestionState"
        },
        "bullet": {
          "$ref": "Bullet",
          "description": "A Bullet that only includes the changes made in this suggestion. This can be used along with the bullet_suggestion_state to see which fields have changed and their new values."
        }
      },
      "id": "SuggestedBullet",
      "type": "object",
      "description": "A suggested change to a Bullet."
    },
    "SuggestedInlineObjectProperties": {
      "id": "SuggestedInlineObjectProperties",
      "type": "object",
      "description": "A suggested change to InlineObjectProperties.",
      "properties": {
        "inlineObjectProperties": {
          "description": "An InlineObjectProperties that only includes the changes made in this suggestion. This can be used along with the inline_object_properties_suggestion_state to see which fields have changed and their new values.",
          "$ref": "InlineObjectProperties"
        },
        "inlineObjectPropertiesSuggestionState": {
          "$ref": "InlineObjectPropertiesSuggestionState",
          "description": "A mask that indicates which of the fields on the base InlineObjectProperties have been changed in this suggestion."
        }
      }
    },
    "InlineObjectPropertiesSuggestionState": {
      "id": "InlineObjectPropertiesSuggestionState",
      "properties": {
        "embeddedObjectSuggestionState": {
          "description": "A mask that indicates which of the fields in embedded_object have been changed in this suggestion.",
          "$ref": "EmbeddedObjectSuggestionState"
        }
      },
      "description": "A mask that indicates which of the fields on the base InlineObjectProperties have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "type": "object"
    },
    "ListProperties": {
      "properties": {
        "nestingLevels": {
          "description": "Describes the properties of the bullets at the associated level. A list has at most 9 levels of nesting with nesting level 0 corresponding to the top-most level and nesting level 8 corresponding to the most nested level. The nesting levels are returned in ascending order with the least nested returned first.",
          "items": {
            "$ref": "NestingLevel"
          },
          "type": "array"
        }
      },
      "id": "ListProperties",
      "type": "object",
      "description": "The properties of a list that describe the look and feel of bullets belonging to paragraphs associated with a list."
    },
    "UpdateTableRowStyleRequest": {
      "id": "UpdateTableRowStyleRequest",
      "type": "object",
      "description": "Updates the TableRowStyle of rows in a table.",
      "properties": {
        "tableRowStyle": {
          "description": "The styles to be set on the rows.",
          "$ref": "TableRowStyle"
        },
        "tableStartLocation": {
          "$ref": "Location",
          "description": "The location where the table starts in the document."
        },
        "rowIndices": {
          "items": {
            "type": "integer",
            "format": "int32"
          },
          "description": "The list of zero-based row indices whose style should be updated. If no indices are specified, all rows will be updated.",
          "type": "array"
        },
        "fields": {
          "type": "string",
          "format": "google-fieldmask",
          "description": "The fields that should be updated. At least one field must be specified. The root `tableRowStyle` is implied and should not be specified. A single `\"*\"` can be used as short-hand for listing every field. For example to update the minimum row height, set `fields` to `\"min_row_height\"`."
        }
      }
    },
    "TableRowStyle": {
      "type": "object",
      "properties": {
        "tableHeader": {
          "type": "boolean",
          "description": "Whether the row is a table header."
        },
        "minRowHeight": {
          "$ref": "Dimension",
          "description": "The minimum height of the row. The row will be rendered in the Docs editor at a height equal to or greater than this value in order to show all the content in the row's cells."
        },
        "preventOverflow": {
          "description": "Whether the row cannot overflow across page or column boundaries.",
          "type": "boolean"
        }
      },
      "description": "Styles that apply to a table row.",
      "id": "TableRowStyle"
    },
    "SectionBreak": {
      "id": "SectionBreak",
      "description": "A StructuralElement representing a section break. A section is a range of content that has the same SectionStyle. A section break represents the start of a new section, and the section style applies to the section after the section break. The document body always begins with a section break.",
      "properties": {
        "suggestedInsertionIds": {
          "items": {
            "type": "string"
          },
          "type": "array",
          "description": "The suggested insertion IDs. A SectionBreak may have multiple insertion IDs if it's a nested suggested change. If empty, then this is not a suggested insertion."
        },
        "sectionStyle": {
          "description": "The style of the section after this section break.",
          "$ref": "SectionStyle"
        },
        "suggestedDeletionIds": {
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content.",
          "items": {
            "type": "string"
          },
          "type": "array"
        }
      },
      "type": "object"
    },
    "TableOfContents": {
      "description": "A StructuralElement representing a table of contents.",
      "id": "TableOfContents",
      "properties": {
        "suggestedDeletionIds": {
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content.",
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "suggestedInsertionIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "The suggested insertion IDs. A TableOfContents may have multiple insertion IDs if it is a nested suggested change. If empty, then this is not a suggested insertion."
        },
        "content": {
          "type": "array",
          "items": {
            "$ref": "StructuralElement"
          },
          "description": "The content of the table of contents."
        }
      },
      "type": "object"
    },
    "ListPropertiesSuggestionState": {
      "id": "ListPropertiesSuggestionState",
      "properties": {
        "nestingLevelsSuggestionStates": {
          "type": "array",
          "items": {
            "$ref": "NestingLevelSuggestionState"
          },
          "description": "A mask that indicates which of the fields on the corresponding NestingLevel in nesting_levels have been changed in this suggestion. The nesting level suggestion states are returned in ascending order of the nesting level with the least nested returned first."
        }
      },
      "description": "A mask that indicates which of the fields on the base ListProperties have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "type": "object"
    },
    "NestingLevelSuggestionState": {
      "description": "A mask that indicates which of the fields on the base NestingLevel have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "type": "object",
      "id": "NestingLevelSuggestionState",
      "properties": {
        "glyphTypeSuggested": {
          "description": "Indicates if there was a suggested change to glyph_type.",
          "type": "boolean"
        },
        "textStyleSuggestionState": {
          "description": "A mask that indicates which of the fields in text style have been changed in this suggestion.",
          "$ref": "TextStyleSuggestionState"
        },
        "glyphFormatSuggested": {
          "description": "Indicates if there was a suggested change to glyph_format.",
          "type": "boolean"
        },
        "indentStartSuggested": {
          "description": "Indicates if there was a suggested change to indent_start.",
          "type": "boolean"
        },
        "startNumberSuggested": {
          "description": "Indicates if there was a suggested change to start_number.",
          "type": "boolean"
        },
        "bulletAlignmentSuggested": {
          "description": "Indicates if there was a suggested change to bullet_alignment.",
          "type": "boolean"
        },
        "indentFirstLineSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to indent_first_line."
        },
        "glyphSymbolSuggested": {
          "description": "Indicates if there was a suggested change to glyph_symbol.",
          "type": "boolean"
        }
      }
    },
    "TextStyleSuggestionState": {
      "id": "TextStyleSuggestionState",
      "properties": {
        "weightedFontFamilySuggested": {
          "description": "Indicates if there was a suggested change to weighted_font_family.",
          "type": "boolean"
        },
        "linkSuggested": {
          "description": "Indicates if there was a suggested change to link.",
          "type": "boolean"
        },
        "backgroundColorSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to background_color."
        },
        "boldSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to bold."
        },
        "smallCapsSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to small_caps."
        },
        "italicSuggested": {
          "description": "Indicates if there was a suggested change to italic.",
          "type": "boolean"
        },
        "strikethroughSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to strikethrough."
        },
        "fontSizeSuggested": {
          "description": "Indicates if there was a suggested change to font_size.",
          "type": "boolean"
        },
        "underlineSuggested": {
          "description": "Indicates if there was a suggested change to underline.",
          "type": "boolean"
        },
        "baselineOffsetSuggested": {
          "description": "Indicates if there was a suggested change to baseline_offset.",
          "type": "boolean"
        },
        "foregroundColorSuggested": {
          "description": "Indicates if there was a suggested change to foreground_color.",
          "type": "boolean"
        }
      },
      "type": "object",
      "description": "A mask that indicates which of the fields on the base TextStyle have been changed in this suggestion. For any field set to true, there's a new suggested value."
    },
    "UpdateTableColumnPropertiesRequest": {
      "type": "object",
      "properties": {
        "tableColumnProperties": {
          "description": "The table column properties to update. If the value of `table_column_properties#width` is less than 5 points (5/72 inch), a 400 bad request error is returned.",
          "$ref": "TableColumnProperties"
        },
        "columnIndices": {
          "items": {
            "type": "integer",
            "format": "int32"
          },
          "description": "The list of zero-based column indices whose property should be updated. If no indices are specified, all columns will be updated.",
          "type": "array"
        },
        "tableStartLocation": {
          "$ref": "Location",
          "description": "The location where the table starts in the document."
        },
        "fields": {
          "type": "string",
          "description": "The fields that should be updated. At least one field must be specified. The root `tableColumnProperties` is implied and should not be specified. A single `\"*\"` can be used as short-hand for listing every field. For example to update the column width, set `fields` to `\"width\"`.",
          "format": "google-fieldmask"
        }
      },
      "description": "Updates the TableColumnProperties of columns in a table.",
      "id": "UpdateTableColumnPropertiesRequest"
    },
    "TableColumnProperties": {
      "type": "object",
      "id": "TableColumnProperties",
      "description": "The properties of a column in a table.",
      "properties": {
        "widthType": {
          "enumDescriptions": [
            "The column width type is unspecified.",
            "The column width is evenly distributed among the other evenly distributed columns. The width of the column is automatically determined and will have an equal portion of the width remaining for the table after accounting for all columns with specified widths.",
            "A fixed column width. The width property contains the column's width."
          ],
          "description": "The width type of the column.",
          "type": "string",
          "enum": [
            "WIDTH_TYPE_UNSPECIFIED",
            "EVENLY_DISTRIBUTED",
            "FIXED_WIDTH"
          ]
        },
        "width": {
          "$ref": "Dimension",
          "description": "The width of the column. Set when the column's `width_type` is FIXED_WIDTH."
        }
      }
    },
    "BatchUpdateDocumentResponse": {
      "properties": {
        "documentId": {
          "description": "The ID of the document to which the updates were applied to.",
          "type": "string"
        },
        "replies": {
          "items": {
            "$ref": "Response"
          },
          "type": "array",
          "description": "The reply of the updates. This maps 1:1 with the updates, although replies to some requests may be empty."
        },
        "writeControl": {
          "$ref": "WriteControl",
          "description": "The updated write control after applying the request."
        }
      },
      "id": "BatchUpdateDocumentResponse",
      "type": "object",
      "description": "Response message from a BatchUpdateDocument request."
    },
    "Response": {
      "properties": {
        "replaceAllText": {
          "$ref": "ReplaceAllTextResponse",
          "description": "The result of replacing text."
        },
        "insertInlineImage": {
          "$ref": "InsertInlineImageResponse",
          "description": "The result of inserting an inline image."
        },
        "createHeader": {
          "$ref": "CreateHeaderResponse",
          "description": "The result of creating a header."
        },
        "createFooter": {
          "description": "The result of creating a footer.",
          "$ref": "CreateFooterResponse"
        },
        "addDocumentTab": {
          "description": "The result of adding a document tab.",
          "$ref": "AddDocumentTabResponse"
        },
        "insertInlineSheetsChart": {
          "description": "The result of inserting an inline Google Sheets chart.",
          "$ref": "InsertInlineSheetsChartResponse"
        },
        "createNamedRange": {
          "description": "The result of creating a named range.",
          "$ref": "CreateNamedRangeResponse"
        },
        "createFootnote": {
          "$ref": "CreateFootnoteResponse",
          "description": "The result of creating a footnote."
        }
      },
      "type": "object",
      "description": "A single response from an update.",
      "id": "Response"
    },
    "AddDocumentTabResponse": {
      "description": "The result of adding a document tab.",
      "id": "AddDocumentTabResponse",
      "type": "object",
      "properties": {
        "tabProperties": {
          "$ref": "TabProperties",
          "description": "The properties of the newly added tab."
        }
      }
    },
    "CreateFootnoteRequest": {
      "description": "Creates a Footnote segment and inserts a new FootnoteReference to it at the given location. The new Footnote segment will contain a space followed by a newline character.",
      "type": "object",
      "properties": {
        "endOfSegmentLocation": {
          "description": "Inserts the footnote reference at the end of the document body. Footnote references cannot be inserted inside a header, footer or footnote. Since footnote references can only be inserted in the body, the segment ID field must be empty.",
          "$ref": "EndOfSegmentLocation"
        },
        "location": {
          "description": "Inserts the footnote reference at a specific index in the document. The footnote reference must be inserted inside the bounds of an existing Paragraph. For instance, it cannot be inserted at a table's start index (i.e. between the table and its preceding paragraph). Footnote references cannot be inserted inside an equation, header, footer or footnote. Since footnote references can only be inserted in the body, the segment ID field must be empty.",
          "$ref": "Location"
        }
      },
      "id": "CreateFootnoteRequest"
    },
    "InsertInlineSheetsChartResponse": {
      "properties": {
        "objectId": {
          "type": "string",
          "description": "The object ID of the inserted chart."
        }
      },
      "description": "The result of inserting an embedded Google Sheets chart.",
      "id": "InsertInlineSheetsChartResponse",
      "type": "object"
    },
    "CreateFooterResponse": {
      "id": "CreateFooterResponse",
      "type": "object",
      "properties": {
        "footerId": {
          "description": "The ID of the created footer.",
          "type": "string"
        }
      },
      "description": "The result of creating a footer."
    },
    "CreateFootnoteResponse": {
      "id": "CreateFootnoteResponse",
      "type": "object",
      "description": "The result of creating a footnote.",
      "properties": {
        "footnoteId": {
          "type": "string",
          "description": "The ID of the created footnote."
        }
      }
    },
    "DeleteContentRangeRequest": {
      "type": "object",
      "properties": {
        "range": {
          "$ref": "Range",
          "description": "The range of content to delete. Deleting text that crosses a paragraph boundary may result in changes to paragraph styles, lists, positioned objects and bookmarks as the two paragraphs are merged. Attempting to delete certain ranges can result in an invalid document structure in which case a 400 bad request error is returned. Some examples of invalid delete requests include: * Deleting one code unit of a surrogate pair. * Deleting the last newline character of a Body, Header, Footer, Footnote, TableCell or TableOfContents. * Deleting the start or end of a Table, TableOfContents or Equation without deleting the entire element. * Deleting the newline character before a Table, TableOfContents or SectionBreak without deleting the element. * Deleting individual rows or cells of a table. Deleting the content within a table cell is allowed."
        }
      },
      "id": "DeleteContentRangeRequest",
      "description": "Deletes content from the document."
    },
    "CreateHeaderRequest": {
      "type": "object",
      "properties": {
        "type": {
          "enumDescriptions": [
            "The header/footer type is unspecified.",
            "A default header/footer."
          ],
          "description": "The type of header to create.",
          "type": "string",
          "enum": [
            "HEADER_FOOTER_TYPE_UNSPECIFIED",
            "DEFAULT"
          ]
        },
        "sectionBreakLocation": {
          "description": "The location of the SectionBreak which begins the section this header should belong to. If `section_break_location' is unset or if it refers to the first section break in the document body, the header applies to the DocumentStyle",
          "$ref": "Location"
        }
      },
      "description": "Creates a Header. The new header is applied to the SectionStyle at the location of the SectionBreak if specified, otherwise it is applied to the DocumentStyle. If a header of the specified type already exists, a 400 bad request error is returned.",
      "id": "CreateHeaderRequest"
    },
    "SubstringMatchCriteria": {
      "type": "object",
      "properties": {
        "matchCase": {
          "type": "boolean",
          "description": "Indicates whether the search should respect case: - `True`: the search is case sensitive. - `False`: the search is case insensitive."
        },
        "searchByRegex": {
          "description": "Optional. True if the find value should be treated as a regular expression. Any backslashes in the pattern should be escaped. - `True`: the search text is treated as a regular expressions. - `False`: the search text is treated as a substring for matching.",
          "type": "boolean"
        },
        "text": {
          "description": "The text to search for in the document.",
          "type": "string"
        }
      },
      "id": "SubstringMatchCriteria",
      "description": "A criteria that matches a specific string of text in the document."
    },
    "InlineObjectProperties": {
      "properties": {
        "embeddedObject": {
          "$ref": "EmbeddedObject",
          "description": "The embedded object of this inline object."
        }
      },
      "id": "InlineObjectProperties",
      "type": "object",
      "description": "Properties of an InlineObject."
    },
    "UpdateDocumentStyleRequest": {
      "id": "UpdateDocumentStyleRequest",
      "type": "object",
      "description": "Updates the DocumentStyle.",
      "properties": {
        "tabId": {
          "type": "string",
          "description": "The tab that contains the style to update. When omitted, the request applies to the first tab. In a document containing a single tab: - If provided, must match the singular tab's ID. - If omitted, the request applies to the singular tab. In a document containing multiple tabs: - If provided, the request applies to the specified tab. - If not provided, the request applies to the first tab in the document."
        },
        "documentStyle": {
          "description": "The styles to set on the document. Certain document style changes may cause other changes in order to mirror the behavior of the Docs editor. See the documentation of DocumentStyle for more information.",
          "$ref": "DocumentStyle"
        },
        "fields": {
          "description": "The fields that should be updated. At least one field must be specified. The root `document_style` is implied and should not be specified. A single `\"*\"` can be used as short-hand for listing every field. For example to update the background, set `fields` to `\"background\"`.",
          "format": "google-fieldmask",
          "type": "string"
        }
      }
    },
    "Size": {
      "type": "object",
      "id": "Size",
      "properties": {
        "height": {
          "$ref": "Dimension",
          "description": "The height of the object."
        },
        "width": {
          "$ref": "Dimension",
          "description": "The width of the object."
        }
      },
      "description": "A width and height."
    },
    "Link": {
      "properties": {
        "bookmark": {
          "$ref": "BookmarkLink",
          "description": "A bookmark in this document. In documents containing a single tab, links to bookmarks within the singular tab continue to return Link.bookmarkId when the includeTabsContent parameter is set to `false` or unset. Otherwise, this field is returned."
        },
        "heading": {
          "$ref": "HeadingLink",
          "description": "A heading in this document. In documents containing a single tab, links to headings within the singular tab continue to return Link.headingId when the includeTabsContent parameter is set to `false` or unset. Otherwise, this field is returned."
        },
        "tabId": {
          "description": "The ID of a tab in this document.",
          "type": "string"
        },
        "url": {
          "type": "string",
          "description": "An external URL."
        },
        "headingId": {
          "description": "The ID of a heading in this document. Legacy field: Instead, set includeTabsContent to `true` and use Link.heading for read and write operations. This field is only returned when includeTabsContent is set to `false` in documents containing a single tab and links to a heading within the singular tab. Otherwise, Link.heading is returned. If this field is used in a write request, the heading is considered to be from the tab ID specified in the request. If a tab ID is not specified in the request, it is considered to be from the first tab in the document.",
          "type": "string"
        },
        "bookmarkId": {
          "description": "The ID of a bookmark in this document. Legacy field: Instead, set includeTabsContent to `true` and use Link.bookmark for read and write operations. This field is only returned when includeTabsContent is set to `false` in documents containing a single tab and links to a bookmark within the singular tab. Otherwise, Link.bookmark is returned. If this field is used in a write request, the bookmark is considered to be from the tab ID specified in the request. If a tab ID is not specified in the request, it is considered to be from the first tab in the document.",
          "type": "string"
        }
      },
      "type": "object",
      "description": "A reference to another portion of a document or an external URL resource.",
      "id": "Link"
    },
    "BookmarkLink": {
      "description": "A reference to a bookmark in this document.",
      "properties": {
        "tabId": {
          "type": "string",
          "description": "The ID of the tab containing this bookmark."
        },
        "id": {
          "description": "The ID of a bookmark in this document.",
          "type": "string"
        }
      },
      "id": "BookmarkLink",
      "type": "object"
    },
    "ReplaceAllTextResponse": {
      "properties": {
        "occurrencesChanged": {
          "type": "integer",
          "description": "The number of occurrences changed by replacing all text.",
          "format": "int32"
        }
      },
      "type": "object",
      "description": "The result of replacing text.",
      "id": "ReplaceAllTextResponse"
    },
    "InsertTableColumnRequest": {
      "id": "InsertTableColumnRequest",
      "type": "object",
      "properties": {
        "tableCellLocation": {
          "description": "The reference table cell location from which columns will be inserted. A new column will be inserted to the left (or right) of the column where the reference cell is. If the reference cell is a merged cell, a new column will be inserted to the left (or right) of the merged cell.",
          "$ref": "TableCellLocation"
        },
        "insertRight": {
          "description": "Whether to insert new column to the right of the reference cell location. - `True`: insert to the right. - `False`: insert to the left.",
          "type": "boolean"
        }
      },
      "description": "Inserts an empty column into a table."
    },
    "DeletePositionedObjectRequest": {
      "properties": {
        "tabId": {
          "description": "The tab that the positioned object to delete is in. When omitted, the request is applied to the first tab. In a document containing a single tab: - If provided, must match the singular tab's ID. - If omitted, the request applies to the singular tab. In a document containing multiple tabs: - If provided, the request applies to the specified tab. - If omitted, the request applies to the first tab in the document.",
          "type": "string"
        },
        "objectId": {
          "description": "The ID of the positioned object to delete.",
          "type": "string"
        }
      },
      "id": "DeletePositionedObjectRequest",
      "description": "Deletes a PositionedObject from the document.",
      "type": "object"
    },
    "CreateFooterRequest": {
      "id": "CreateFooterRequest",
      "type": "object",
      "description": "Creates a Footer. The new footer is applied to the SectionStyle at the location of the SectionBreak if specified, otherwise it is applied to the DocumentStyle. If a footer of the specified type already exists, a 400 bad request error is returned.",
      "properties": {
        "sectionBreakLocation": {
          "description": "The location of the SectionBreak immediately preceding the section whose SectionStyle this footer should belong to. If this is unset or refers to the first section break in the document, the footer applies to the document style.",
          "$ref": "Location"
        },
        "type": {
          "type": "string",
          "enum": [
            "HEADER_FOOTER_TYPE_UNSPECIFIED",
            "DEFAULT"
          ],
          "description": "The type of footer to create.",
          "enumDescriptions": [
            "The header/footer type is unspecified.",
            "A default header/footer."
          ]
        }
      }
    },
    "BulletSuggestionState": {
      "type": "object",
      "id": "BulletSuggestionState",
      "description": "A mask that indicates which of the fields on the base Bullet have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "properties": {
        "listIdSuggested": {
          "description": "Indicates if there was a suggested change to the list_id.",
          "type": "boolean"
        },
        "nestingLevelSuggested": {
          "description": "Indicates if there was a suggested change to the nesting_level.",
          "type": "boolean"
        },
        "textStyleSuggestionState": {
          "$ref": "TextStyleSuggestionState",
          "description": "A mask that indicates which of the fields in text style have been changed in this suggestion."
        }
      }
    },
    "SuggestedNamedStyles": {
      "type": "object",
      "properties": {
        "namedStyles": {
          "description": "A NamedStyles that only includes the changes made in this suggestion. This can be used along with the named_styles_suggestion_state to see which fields have changed and their new values.",
          "$ref": "NamedStyles"
        },
        "namedStylesSuggestionState": {
          "description": "A mask that indicates which of the fields on the base NamedStyles have been changed in this suggestion.",
          "$ref": "NamedStylesSuggestionState"
        }
      },
      "description": "A suggested change to the NamedStyles.",
      "id": "SuggestedNamedStyles"
    },
    "Bullet": {
      "description": "Describes the bullet of a paragraph.",
      "properties": {
        "textStyle": {
          "$ref": "TextStyle",
          "description": "The paragraph-specific text style applied to this bullet."
        },
        "nestingLevel": {
          "description": "The nesting level of this paragraph in the list.",
          "format": "int32",
          "type": "integer"
        },
        "listId": {
          "type": "string",
          "description": "The ID of the list this paragraph belongs to."
        }
      },
      "type": "object",
      "id": "Bullet"
    },
    "TabStop": {
      "properties": {
        "offset": {
          "$ref": "Dimension",
          "description": "The offset between this tab stop and the start margin."
        },
        "alignment": {
          "enumDescriptions": [
            "The tab stop alignment is unspecified.",
            "The tab stop is aligned to the start of the line. This is the default.",
            "The tab stop is aligned to the center of the line.",
            "The tab stop is aligned to the end of the line."
          ],
          "type": "string",
          "enum": [
            "TAB_STOP_ALIGNMENT_UNSPECIFIED",
            "START",
            "CENTER",
            "END"
          ],
          "description": "The alignment of this tab stop. If unset, the value defaults to START."
        }
      },
      "id": "TabStop",
      "type": "object",
      "description": "A tab stop within a paragraph."
    },
    "ParagraphBorder": {
      "properties": {
        "color": {
          "description": "The color of the border.",
          "$ref": "OptionalColor"
        },
        "width": {
          "description": "The width of the border.",
          "$ref": "Dimension"
        },
        "padding": {
          "$ref": "Dimension",
          "description": "The padding of the border."
        },
        "dashStyle": {
          "enumDescriptions": [
            "Unspecified dash style.",
            "Solid line. Corresponds to ECMA-376 ST_PresetLineDashVal value 'solid'. This is the default dash style.",
            "Dotted line. Corresponds to ECMA-376 ST_PresetLineDashVal value 'dot'.",
            "Dashed line. Corresponds to ECMA-376 ST_PresetLineDashVal value 'dash'."
          ],
          "type": "string",
          "enum": [
            "DASH_STYLE_UNSPECIFIED",
            "SOLID",
            "DOT",
            "DASH"
          ],
          "description": "The dash style of the border."
        }
      },
      "description": "A border around a paragraph.",
      "id": "ParagraphBorder",
      "type": "object"
    },
    "InsertDateRequest": {
      "id": "InsertDateRequest",
      "type": "object",
      "properties": {
        "endOfSegmentLocation": {
          "$ref": "EndOfSegmentLocation",
          "description": "Inserts the date at the end of the given header, footer or document body."
        },
        "dateElementProperties": {
          "description": "The properties of the date to insert.",
          "$ref": "DateElementProperties"
        },
        "location": {
          "description": "Inserts the date at a specific index in the document. The date must be inserted inside the bounds of an existing Paragraph. For instance, it cannot be inserted at a table's start index (i.e. between an existing table and its preceding paragraph).",
          "$ref": "Location"
        }
      },
      "description": "Inserts a date at the specified location."
    },
    "DateElementProperties": {
      "properties": {
        "displayText": {
          "description": "Output only. Indicates how the DateElement is displayed in the document.",
          "type": "string"
        },
        "dateFormat": {
          "type": "string",
          "enum": [
            "DATE_FORMAT_UNSPECIFIED",
            "DATE_FORMAT_CUSTOM",
            "DATE_FORMAT_MONTH_DAY_ABBREVIATED",
            "DATE_FORMAT_MONTH_DAY_FULL",
            "DATE_FORMAT_MONTH_DAY_YEAR_ABBREVIATED",
            "DATE_FORMAT_ISO8601"
          ],
          "description": "Determines how the date part of the DateElement will be displayed in the document. If unset, the default value is DATE_FORMAT_MONTH_DAY_YEAR_ABBREVIATED, indicating the DateElement will be formatted as `MMM d, y` in `en`, or locale specific equivalent.",
          "enumDescriptions": [
            "The date format is unspecified.",
            "Output only. The date format is imported from an external source.",
            "The date format is an abbreviated month followed by the day. For example, \"Jan 1\".",
            "The date format is a month followed by the day. For example, \"January 01\".",
            "The date format is an abbreviated month followed by the day and the year. For example, \"Jan 1, 1970\".",
            "The date format is in ISO 8601 format. For example, \"1970-01-01\"."
          ]
        },
        "timeFormat": {
          "description": "Determines how the time part of the DateElement will be displayed in the document. If unset, the default value is TIME_FORMAT_DISABLED, indicating no time should be shown.",
          "enumDescriptions": [
            "The time format is unspecified.",
            "Indicates that the date does not have a time.",
            "The time format shows the hour and minute. For example, \"Jan 1, 1970 12:00 PM\".",
            "The time format shows the hour, minute, and timezone. For example, \"Jan 1, 1970 12:00 PM UTC\"."
          ],
          "type": "string",
          "enum": [
            "TIME_FORMAT_UNSPECIFIED",
            "TIME_FORMAT_DISABLED",
            "TIME_FORMAT_HOUR_MINUTE",
            "TIME_FORMAT_HOUR_MINUTE_TIMEZONE"
          ]
        },
        "locale": {
          "description": "The language code of the DateElement. For example, `en`. If unset, the default locale is `en`. Limited to the following locales: `af`, `am`, `ar`, `as`, `az`, `be`, `bg`, `bn`, `ca`, `cs`, `da`, `de`, `el`, `en`, `en-CA`, `en-GB`, `es`, `es-419`, `et`, `eu`, `fa`, `fi`, `fil`, `fr`, `fr-CA`, `gl`, `gu`, `hi`, `hr`, `hu`, `hy`, `id`, `is`, `it`, `iw`, `ja`, `ka`, `kk`, `km`, `kn`, `ko`, `lo`, `lt`, `lv`, `mk`, `ml`, `mn`, `mr`, `ms`, `ne`, `nl`, `no`, `or`, `pa`, `pl`, `pt-BR`, `pt-PT`, `ro`, `ru`, `si`, `sk`, `sl`, `sq`, `sr`, `sv`, `sw`, `ta`, `te`, `th`, `tr`, `uk`, `ur`, `uz`, `vi`, `zh-CN`, `zh-HK`, `zh-TW`, `zu`, `cy`, `my`.",
          "type": "string"
        },
        "timeZoneId": {
          "description": "The time zone of the DateElement, as defined by the Unicode Common Locale Data Repository (CLDR) project. For example, `America/New_York`. If unset, the default time zone is `etc/UTC`.",
          "type": "string"
        },
        "timestamp": {
          "type": "string",
          "description": "The point in time to represent, in seconds and nanoseconds since Unix epoch: January 1, 1970 at midnight UTC. Timestamp is expected to be in UTC. If time_zone_id is set, the timestamp is adjusted according to the time zone. For example, a timestamp of `18000` with a date format of `DATE_FORMAT_ISO8601` and time format of `TIME_FORMAT_HOUR_MINUTE` would be displayed as `1970-01-01 5:00 AM`. A timestamp of `18000` with date format of `DATE_FORMAT_ISO8601`, time format of `TIME_FORMAT_HOUR_MINUTE`, and time zone set to `America/New_York` will instead be `1970-01-01 12:00 AM`.",
          "format": "google-datetime"
        }
      },
      "description": "Properties of a DateElement.",
      "type": "object",
      "id": "DateElementProperties"
    },
    "UpdateTextStyleRequest": {
      "properties": {
        "textStyle": {
          "description": "The styles to set on the text. If the value for a particular style matches that of the parent, that style will be set to inherit. Certain text style changes may cause other changes in order to to mirror the behavior of the Docs editor. See the documentation of TextStyle for more information.",
          "$ref": "TextStyle"
        },
        "range": {
          "description": "The range of text to style. The range may be extended to include adjacent newlines. If the range fully contains a paragraph belonging to a list, the paragraph's bullet is also updated with the matching text style. Ranges cannot be inserted inside a relative UpdateTextStyleRequest.",
          "$ref": "Range"
        },
        "fields": {
          "type": "string",
          "description": "The fields that should be updated. At least one field must be specified. The root `text_style` is implied and should not be specified. A single `\"*\"` can be used as short-hand for listing every field. For example, to update the text style to bold, set `fields` to `\"bold\"`. To reset a property to its default value, include its field name in the field mask but leave the field itself unset.",
          "format": "google-fieldmask"
        }
      },
      "id": "UpdateTextStyleRequest",
      "description": "Update the styling of text.",
      "type": "object"
    },
    "Range": {
      "id": "Range",
      "description": "Specifies a contiguous range of text.",
      "type": "object",
      "properties": {
        "startIndex": {
          "type": "integer",
          "format": "int32",
          "description": "The zero-based start index of this range, in UTF-16 code units. In all current uses, a start index must be provided. This field is an Int32Value in order to accommodate future use cases with open-ended ranges."
        },
        "endIndex": {
          "format": "int32",
          "type": "integer",
          "description": "The zero-based end index of this range, exclusive, in UTF-16 code units. In all current uses, an end index must be provided. This field is an Int32Value in order to accommodate future use cases with open-ended ranges."
        },
        "segmentId": {
          "description": "The ID of the header, footer, or footnote that this range is contained in. An empty segment ID signifies the document's body.",
          "type": "string"
        },
        "tabId": {
          "type": "string",
          "description": "The tab that contains this range. When omitted, the request applies to the first tab. In a document containing a single tab: - If provided, must match the singular tab's ID. - If omitted, the request applies to the singular tab. In a document containing multiple tabs: - If provided, the request applies to the specified tab. - If omitted, the request applies to the first tab in the document."
        }
      }
    },
    "UpdateTableCellStyleRequest": {
      "type": "object",
      "id": "UpdateTableCellStyleRequest",
      "description": "Updates the style of a range of table cells.",
      "properties": {
        "tableCellStyle": {
          "$ref": "TableCellStyle",
          "description": "The style to set on the table cells. When updating borders, if a cell shares a border with an adjacent cell, the corresponding border property of the adjacent cell is updated as well. Borders that are merged and invisible are not updated. Since updating a border shared by adjacent cells in the same request can cause conflicting border updates, border updates are applied in the following order: - `border_right` - `border_left` - `border_bottom` - `border_top`"
        },
        "fields": {
          "description": "The fields that should be updated. At least one field must be specified. The root `tableCellStyle` is implied and should not be specified. A single `\"*\"` can be used as short-hand for listing every field. For example to update the table cell background color, set `fields` to `\"backgroundColor\"`. To reset a property to its default value, include its field name in the field mask but leave the field itself unset.",
          "type": "string",
          "format": "google-fieldmask"
        },
        "tableRange": {
          "$ref": "TableRange",
          "description": "The table range representing the subset of the table to which the updates are applied."
        },
        "tableStartLocation": {
          "description": "The location where the table starts in the document. When specified, the updates are applied to all the cells in the table.",
          "$ref": "Location"
        }
      }
    },
    "NamedRanges": {
      "properties": {
        "name": {
          "description": "The name that all the named ranges share.",
          "type": "string"
        },
        "namedRanges": {
          "type": "array",
          "description": "The NamedRanges that share the same name.",
          "items": {
            "$ref": "NamedRange"
          }
        }
      },
      "description": "A collection of all the NamedRanges in the document that share a given name.",
      "id": "NamedRanges",
      "type": "object"
    },
    "NamedRange": {
      "id": "NamedRange",
      "description": "A collection of Ranges with the same named range ID. Named ranges allow developers to associate parts of a document with an arbitrary user-defined label so their contents can be programmatically read or edited later. A document can contain multiple named ranges with the same name, but every named range has a unique ID. A named range is created with a single Range, and content inserted inside a named range generally expands that range. However, certain document changes can cause the range to be split into multiple ranges. Named ranges are not private. All applications and collaborators that have access to the document can see its named ranges.",
      "type": "object",
      "properties": {
        "name": {
          "description": "The name of the named range.",
          "type": "string"
        },
        "ranges": {
          "type": "array",
          "description": "The ranges that belong to this named range.",
          "items": {
            "$ref": "Range"
          }
        },
        "namedRangeId": {
          "type": "string",
          "description": "The ID of the named range."
        }
      }
    },
    "EndOfSegmentLocation": {
      "type": "object",
      "id": "EndOfSegmentLocation",
      "description": "Location at the end of a body, header, footer or footnote. The location is immediately before the last newline in the document segment.",
      "properties": {
        "tabId": {
          "type": "string",
          "description": "The tab that the location is in. When omitted, the request is applied to the first tab. In a document containing a single tab: - If provided, must match the singular tab's ID. - If omitted, the request applies to the singular tab. In a document containing multiple tabs: - If provided, the request applies to the specified tab. - If omitted, the request applies to the first tab in the document."
        },
        "segmentId": {
          "type": "string",
          "description": "The ID of the header, footer or footnote the location is in. An empty segment ID signifies the document's body."
        }
      }
    },
    "InsertInlineImageRequest": {
      "description": "Inserts an InlineObject containing an image at the given location.",
      "type": "object",
      "properties": {
        "location": {
          "$ref": "Location",
          "description": "Inserts the image at a specific index in the document. The image must be inserted inside the bounds of an existing Paragraph. For instance, it cannot be inserted at a table's start index (i.e. between the table and its preceding paragraph). Inline images cannot be inserted inside a footnote or equation."
        },
        "endOfSegmentLocation": {
          "$ref": "EndOfSegmentLocation",
          "description": "Inserts the text at the end of a header, footer or the document body. Inline images cannot be inserted inside a footnote."
        },
        "objectSize": {
          "description": "The size that the image should appear as in the document. This property is optional and the final size of the image in the document is determined by the following rules: * If neither width nor height is specified, then a default size of the image is calculated based on its resolution. * If one dimension is specified then the other dimension is calculated to preserve the aspect ratio of the image. * If both width and height are specified, the image is scaled to fit within the provided dimensions while maintaining its aspect ratio.",
          "$ref": "Size"
        },
        "uri": {
          "description": "The image URI. The image is fetched once at insertion time and a copy is stored for display inside the document. Images must be less than 50MB in size, cannot exceed 25 megapixels, and must be in one of PNG, JPEG, or GIF format. The provided URI must be publicly accessible and at most 2 kB in length. The URI itself is saved with the image, and exposed via the ImageProperties.content_uri field.",
          "type": "string"
        }
      },
      "id": "InsertInlineImageRequest"
    },
    "DeleteParagraphBulletsRequest": {
      "id": "DeleteParagraphBulletsRequest",
      "properties": {
        "range": {
          "description": "The range to delete bullets from.",
          "$ref": "Range"
        }
      },
      "type": "object",
      "description": "Deletes bullets from all of the paragraphs that overlap with the given range. The nesting level of each paragraph will be visually preserved by adding indent to the start of the corresponding paragraph."
    },
    "NestingLevel": {
      "properties": {
        "bulletAlignment": {
          "enumDescriptions": [
            "The bullet alignment is unspecified.",
            "The bullet is aligned to the start of the space allotted for rendering the bullet. Left-aligned for LTR text, right-aligned otherwise.",
            "The bullet is aligned to the center of the space allotted for rendering the bullet.",
            "The bullet is aligned to the end of the space allotted for rendering the bullet. Right-aligned for LTR text, left-aligned otherwise."
          ],
          "type": "string",
          "enum": [
            "BULLET_ALIGNMENT_UNSPECIFIED",
            "START",
            "CENTER",
            "END"
          ],
          "description": "The alignment of the bullet within the space allotted for rendering the bullet."
        },
        "glyphFormat": {
          "type": "string",
          "description": "The format string used by bullets at this level of nesting. The glyph format contains one or more placeholders, and these placeholders are replaced with the appropriate values depending on the glyph_type or glyph_symbol. The placeholders follow the pattern `%[nesting_level]`. Furthermore, placeholders can have prefixes and suffixes. Thus, the glyph format follows the pattern `%[nesting_level]`. Note that the prefix and suffix are optional and can be arbitrary strings. For example, the glyph format `%0.` indicates that the rendered glyph will replace the placeholder with the corresponding glyph for nesting level 0 followed by a period as the suffix. So a list with a glyph type of UPPER_ALPHA and glyph format `%0.` at nesting level 0 will result in a list with rendered glyphs `A.` `B.` `C.` The glyph format can contain placeholders for the current nesting level as well as placeholders for parent nesting levels. For example, a list can have a glyph format of `%0.` at nesting level 0 and a glyph format of `%0.%1.` at nesting level 1. Assuming both nesting levels have DECIMAL glyph types, this would result in a list with rendered glyphs `1.` `2.` ` 2.1.` ` 2.2.` `3.` For nesting levels that are ordered, the string that replaces a placeholder in the glyph format for a particular paragraph depends on the paragraph's order within the list."
        },
        "glyphSymbol": {
          "description": "A custom glyph symbol used by bullets when paragraphs at this level of nesting is unordered. The glyph symbol replaces placeholders within the glyph_format. For example, if the glyph_symbol is the solid circle corresponding to Unicode U+25cf code point and the glyph_format is `%0`, the rendered glyph would be the solid circle.",
          "type": "string"
        },
        "startNumber": {
          "description": "The number of the first list item at this nesting level. A value of 0 is treated as a value of 1 for lettered lists and Roman numeral lists. For values of both 0 and 1, lettered and Roman numeral lists will begin at `a` and `i` respectively. This value is ignored for nesting levels with unordered glyphs.",
          "type": "integer",
          "format": "int32"
        },
        "indentStart": {
          "$ref": "Dimension",
          "description": "The amount of indentation for paragraphs at this level of nesting. Applied to the side that corresponds to the start of the text, based on the paragraph's content direction."
        },
        "indentFirstLine": {
          "$ref": "Dimension",
          "description": "The amount of indentation for the first line of paragraphs at this level of nesting."
        },
        "glyphType": {
          "description": "The type of glyph used by bullets when paragraphs at this level of nesting is ordered. The glyph type determines the type of glyph used to replace placeholders within the glyph_format when paragraphs at this level of nesting are ordered. For example, if the nesting level is 0, the glyph_format is `%0.` and the glyph type is DECIMAL, then the rendered glyph would replace the placeholder `%0` in the glyph format with a number corresponding to the list item's order within the list.",
          "enumDescriptions": [
            "The glyph type is unspecified or unsupported.",
            "An empty string.",
            "A number, like `1`, `2`, or `3`.",
            "A number where single digit numbers are prefixed with a zero, like `01`, `02`, or `03`. Numbers with more than one digit are not prefixed with a zero.",
            "An uppercase letter, like `A`, `B`, or `C`.",
            "A lowercase letter, like `a`, `b`, or `c`.",
            "An uppercase Roman numeral, like `I`, `II`, or `III`.",
            "A lowercase Roman numeral, like `i`, `ii`, or `iii`."
          ],
          "type": "string",
          "enum": [
            "GLYPH_TYPE_UNSPECIFIED",
            "NONE",
            "DECIMAL",
            "ZERO_DECIMAL",
            "UPPER_ALPHA",
            "ALPHA",
            "UPPER_ROMAN",
            "ROMAN"
          ]
        },
        "textStyle": {
          "description": "The text style of bullets at this level of nesting.",
          "$ref": "TextStyle"
        }
      },
      "id": "NestingLevel",
      "description": "Contains properties describing the look and feel of a list bullet at a given level of nesting.",
      "type": "object"
    },
    "Table": {
      "type": "object",
      "id": "Table",
      "properties": {
        "suggestedInsertionIds": {
          "items": {
            "type": "string"
          },
          "description": "The suggested insertion IDs. A Table may have multiple insertion IDs if it's a nested suggested change. If empty, then this is not a suggested insertion.",
          "type": "array"
        },
        "suggestedDeletionIds": {
          "items": {
            "type": "string"
          },
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content.",
          "type": "array"
        },
        "rows": {
          "type": "integer",
          "format": "int32",
          "description": "Number of rows in the table."
        },
        "columns": {
          "description": "Number of columns in the table. It's possible for a table to be non-rectangular, so some rows may have a different number of cells.",
          "type": "integer",
          "format": "int32"
        },
        "tableStyle": {
          "description": "The style of the table.",
          "$ref": "TableStyle"
        },
        "tableRows": {
          "description": "The contents and style of each row.",
          "items": {
            "$ref": "TableRow"
          },
          "type": "array"
        }
      },
      "description": "A StructuralElement representing a table."
    },
    "TableRow": {
      "type": "object",
      "description": "The contents and style of a row in a Table.",
      "properties": {
        "suggestedDeletionIds": {
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content.",
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "endIndex": {
          "type": "integer",
          "description": "The zero-based end index of this row, exclusive, in UTF-16 code units.",
          "format": "int32"
        },
        "startIndex": {
          "description": "The zero-based start index of this row, in UTF-16 code units.",
          "type": "integer",
          "format": "int32"
        },
        "suggestedTableRowStyleChanges": {
          "description": "The suggested style changes to this row, keyed by suggestion ID.",
          "type": "object",
          "additionalProperties": {
            "$ref": "SuggestedTableRowStyle"
          }
        },
        "suggestedInsertionIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "The suggested insertion IDs. A TableRow may have multiple insertion IDs if it's a nested suggested change. If empty, then this is not a suggested insertion."
        },
        "tableRowStyle": {
          "description": "The style of the table row.",
          "$ref": "TableRowStyle"
        },
        "tableCells": {
          "type": "array",
          "description": "The contents and style of each cell in this row. It's possible for a table to be non-rectangular, so some rows may have a different number of cells than other rows in the same table.",
          "items": {
            "$ref": "TableCell"
          }
        }
      },
      "id": "TableRow"
    },
    "SuggestedTableRowStyle": {
      "id": "SuggestedTableRowStyle",
      "type": "object",
      "description": "A suggested change to a TableRowStyle.",
      "properties": {
        "tableRowStyle": {
          "$ref": "TableRowStyle",
          "description": "A TableRowStyle that only includes the changes made in this suggestion. This can be used along with the table_row_style_suggestion_state to see which fields have changed and their new values."
        },
        "tableRowStyleSuggestionState": {
          "description": "A mask that indicates which of the fields on the base TableRowStyle have been changed in this suggestion.",
          "$ref": "TableRowStyleSuggestionState"
        }
      }
    },
    "TableRowStyleSuggestionState": {
      "type": "object",
      "id": "TableRowStyleSuggestionState",
      "description": "A mask that indicates which of the fields on the base TableRowStyle have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "properties": {
        "minRowHeightSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to min_row_height."
        }
      }
    },
    "TableCell": {
      "type": "object",
      "description": "The contents and style of a cell in a Table.",
      "properties": {
        "startIndex": {
          "type": "integer",
          "description": "The zero-based start index of this cell, in UTF-16 code units.",
          "format": "int32"
        },
        "tableCellStyle": {
          "description": "The style of the cell.",
          "$ref": "TableCellStyle"
        },
        "endIndex": {
          "description": "The zero-based end index of this cell, exclusive, in UTF-16 code units.",
          "type": "integer",
          "format": "int32"
        },
        "suggestedDeletionIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content."
        },
        "suggestedInsertionIds": {
          "description": "The suggested insertion IDs. A TableCell may have multiple insertion IDs if it's a nested suggested change. If empty, then this is not a suggested insertion.",
          "items": {
            "type": "string"
          },
          "type": "array"
        },
        "content": {
          "items": {
            "$ref": "StructuralElement"
          },
          "type": "array",
          "description": "The content of the cell."
        },
        "suggestedTableCellStyleChanges": {
          "type": "object",
          "description": "The suggested changes to the table cell style, keyed by suggestion ID.",
          "additionalProperties": {
            "$ref": "SuggestedTableCellStyle"
          }
        }
      },
      "id": "TableCell"
    },
    "SuggestedPositionedObjectProperties": {
      "id": "SuggestedPositionedObjectProperties",
      "description": "A suggested change to PositionedObjectProperties.",
      "properties": {
        "positionedObjectPropertiesSuggestionState": {
          "description": "A mask that indicates which of the fields on the base PositionedObjectProperties have been changed in this suggestion.",
          "$ref": "PositionedObjectPropertiesSuggestionState"
        },
        "positionedObjectProperties": {
          "description": "A PositionedObjectProperties that only includes the changes made in this suggestion. This can be used along with the positioned_object_properties_suggestion_state to see which fields have changed and their new values.",
          "$ref": "PositionedObjectProperties"
        }
      },
      "type": "object"
    },
    "PositionedObjectPropertiesSuggestionState": {
      "type": "object",
      "description": "A mask that indicates which of the fields on the base PositionedObjectProperties have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "id": "PositionedObjectPropertiesSuggestionState",
      "properties": {
        "embeddedObjectSuggestionState": {
          "$ref": "EmbeddedObjectSuggestionState",
          "description": "A mask that indicates which of the fields in embedded_object have been changed in this suggestion."
        },
        "positioningSuggestionState": {
          "$ref": "PositionedObjectPositioningSuggestionState",
          "description": "A mask that indicates which of the fields in positioning have been changed in this suggestion."
        }
      }
    },
    "PositionedObjectPositioningSuggestionState": {
      "type": "object",
      "id": "PositionedObjectPositioningSuggestionState",
      "properties": {
        "leftOffsetSuggested": {
          "description": "Indicates if there was a suggested change to left_offset.",
          "type": "boolean"
        },
        "topOffsetSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to top_offset."
        },
        "layoutSuggested": {
          "description": "Indicates if there was a suggested change to layout.",
          "type": "boolean"
        }
      },
      "description": "A mask that indicates which of the fields on the base PositionedObjectPositioning have been changed in this suggestion. For any field set to true, there's a new suggested value."
    },
    "InsertSectionBreakRequest": {
      "properties": {
        "endOfSegmentLocation": {
          "description": "Inserts a newline and a section break at the end of the document body. Section breaks cannot be inserted inside a footnote, header or footer. Because section breaks can only be inserted inside the body, the segment ID field must be empty.",
          "$ref": "EndOfSegmentLocation"
        },
        "sectionType": {
          "description": "The type of section to insert.",
          "type": "string",
          "enum": [
            "SECTION_TYPE_UNSPECIFIED",
            "CONTINUOUS",
            "NEXT_PAGE"
          ],
          "enumDescriptions": [
            "The section type is unspecified.",
            "The section starts immediately after the last paragraph of the previous section.",
            "The section starts on the next page."
          ]
        },
        "location": {
          "description": "Inserts a newline and a section break at a specific index in the document. The section break must be inserted inside the bounds of an existing Paragraph. For instance, it cannot be inserted at a table's start index (i.e. between the table and its preceding paragraph). Section breaks cannot be inserted inside a table, equation, footnote, header, or footer. Since section breaks can only be inserted inside the body, the segment ID field must be empty.",
          "$ref": "Location"
        }
      },
      "id": "InsertSectionBreakRequest",
      "description": "Inserts a section break at the given location. A newline character will be inserted before the section break.",
      "type": "object"
    },
    "WeightedFontFamily": {
      "id": "WeightedFontFamily",
      "description": "Represents a font family and weight of text.",
      "type": "object",
      "properties": {
        "weight": {
          "format": "int32",
          "description": "The weight of the font. This field can have any value that's a multiple of `100` between `100` and `900`, inclusive. This range corresponds to the numerical values described in the CSS 2.1 Specification, [section 15.6](https://www.w3.org/TR/CSS21/fonts.html#font-boldness), with non-numerical values disallowed. The default value is `400` (\"normal\"). The font weight makes up just one component of the rendered font weight. A combination of the `weight` and the text style's resolved `bold` value determine the rendered weight, after accounting for inheritance: * If the text is bold and the weight is less than `400`, the rendered weight is 400. * If the text is bold and the weight is greater than or equal to `400` but is less than `700`, the rendered weight is `700`. * If the weight is greater than or equal to `700`, the rendered weight is equal to the weight. * If the text is not bold, the rendered weight is equal to the weight.",
          "type": "integer"
        },
        "fontFamily": {
          "type": "string",
          "description": "The font family of the text. The font family can be any font from the Font menu in Docs or from [Google Fonts] (https://fonts.google.com/). If the font name is unrecognized, the text is rendered in `Arial`."
        }
      }
    },
    "TableStyle": {
      "type": "object",
      "id": "TableStyle",
      "properties": {
        "tableColumnProperties": {
          "description": "The properties of each column. Note that in Docs, tables contain rows and rows contain cells, similar to HTML. So the properties for a row can be found on the row's table_row_style.",
          "items": {
            "$ref": "TableColumnProperties"
          },
          "type": "array"
        }
      },
      "description": "Styles that apply to a table."
    },
    "TableRange": {
      "properties": {
        "rowSpan": {
          "type": "integer",
          "format": "int32",
          "description": "The row span of the table range."
        },
        "tableCellLocation": {
          "description": "The cell location where the table range starts.",
          "$ref": "TableCellLocation"
        },
        "columnSpan": {
          "format": "int32",
          "type": "integer",
          "description": "The column span of the table range."
        }
      },
      "id": "TableRange",
      "type": "object",
      "description": "A table range represents a reference to a subset of a table. It's important to note that the cells specified by a table range do not necessarily form a rectangle. For example, let's say we have a 3 x 3 table where all the cells of the last row are merged together. The table looks like this: [ ] A table range with table cell location = (table_start_location, row = 0, column = 0), row span = 3 and column span = 2 specifies the following cells: x x [ x x x ]"
    },
    "Dimension": {
      "type": "object",
      "id": "Dimension",
      "properties": {
        "unit": {
          "description": "The units for magnitude.",
          "enumDescriptions": [
            "The units are unknown.",
            "A point, 1/72 of an inch."
          ],
          "type": "string",
          "enum": [
            "UNIT_UNSPECIFIED",
            "PT"
          ]
        },
        "magnitude": {
          "type": "number",
          "description": "The magnitude.",
          "format": "double"
        }
      },
      "description": "A magnitude in a single direction in the specified units."
    },
    "TabsCriteria": {
      "properties": {
        "tabIds": {
          "type": "array",
          "description": "The list of tab IDs in which the request executes.",
          "items": {
            "type": "string"
          }
        }
      },
      "id": "TabsCriteria",
      "description": "A criteria that specifies in which tabs a request executes.",
      "type": "object"
    },
    "InsertInlineImageResponse": {
      "type": "object",
      "properties": {
        "objectId": {
          "type": "string",
          "description": "The ID of the created InlineObject."
        }
      },
      "id": "InsertInlineImageResponse",
      "description": "The result of inserting an inline image."
    },
    "InsertTableRequest": {
      "properties": {
        "columns": {
          "format": "int32",
          "description": "The number of columns in the table.",
          "type": "integer"
        },
        "location": {
          "description": "Inserts the table at a specific model index. A newline character will be inserted before the inserted table, therefore the table start index will be at the specified location index + 1. The table must be inserted inside the bounds of an existing Paragraph. For instance, it cannot be inserted at a table's start index (i.e. between an existing table and its preceding paragraph). Tables cannot be inserted inside a footnote or equation.",
          "$ref": "Location"
        },
        "rows": {
          "type": "integer",
          "format": "int32",
          "description": "The number of rows in the table."
        },
        "endOfSegmentLocation": {
          "$ref": "EndOfSegmentLocation",
          "description": "Inserts the table at the end of the given header, footer or document body. A newline character will be inserted before the inserted table. Tables cannot be inserted inside a footnote."
        }
      },
      "description": "Inserts a table at the specified location. A newline character will be inserted before the inserted table.",
      "id": "InsertTableRequest",
      "type": "object"
    },
    "CreateParagraphBulletsRequest": {
      "type": "object",
      "id": "CreateParagraphBulletsRequest",
      "properties": {
        "bulletPreset": {
          "description": "The kinds of bullet glyphs to be used.",
          "type": "string",
          "enum": [
            "BULLET_GLYPH_PRESET_UNSPECIFIED",
            "BULLET_DISC_CIRCLE_SQUARE",
            "BULLET_DIAMONDX_ARROW3D_SQUARE",
            "BULLET_CHECKBOX",
            "BULLET_ARROW_DIAMOND_DISC",
            "BULLET_STAR_CIRCLE_SQUARE",
            "BULLET_ARROW3D_CIRCLE_SQUARE",
            "BULLET_LEFTTRIANGLE_DIAMOND_DISC",
            "BULLET_DIAMONDX_HOLLOWDIAMOND_SQUARE",
            "BULLET_DIAMOND_CIRCLE_SQUARE",
            "NUMBERED_DECIMAL_ALPHA_ROMAN",
            "NUMBERED_DECIMAL_ALPHA_ROMAN_PARENS",
            "NUMBERED_DECIMAL_NESTED",
            "NUMBERED_UPPERALPHA_ALPHA_ROMAN",
            "NUMBERED_UPPERROMAN_UPPERALPHA_DECIMAL",
            "NUMBERED_ZERODECIMAL_ALPHA_ROMAN"
          ],
          "enumDescriptions": [
            "The bullet glyph preset is unspecified.",
            "A bulleted list with a `DISC`, `CIRCLE` and `SQUARE` bullet glyph for the first 3 list nesting levels.",
            "A bulleted list with a `DIAMONDX`, `ARROW3D` and `SQUARE` bullet glyph for the first 3 list nesting levels.",
            "A bulleted list with `CHECKBOX` bullet glyphs for all list nesting levels.",
            "A bulleted list with a `ARROW`, `DIAMOND` and `DISC` bullet glyph for the first 3 list nesting levels.",
            "A bulleted list with a `STAR`, `CIRCLE` and `SQUARE` bullet glyph for the first 3 list nesting levels.",
            "A bulleted list with a `ARROW3D`, `CIRCLE` and `SQUARE` bullet glyph for the first 3 list nesting levels.",
            "A bulleted list with a `LEFTTRIANGLE`, `DIAMOND` and `DISC` bullet glyph for the first 3 list nesting levels.",
            "A bulleted list with a `DIAMONDX`, `HOLLOWDIAMOND` and `SQUARE` bullet glyph for the first 3 list nesting levels.",
            "A bulleted list with a `DIAMOND`, `CIRCLE` and `SQUARE` bullet glyph for the first 3 list nesting levels.",
            "A numbered list with `DECIMAL`, `ALPHA` and `ROMAN` numeric glyphs for the first 3 list nesting levels, followed by periods.",
            "A numbered list with `DECIMAL`, `ALPHA` and `ROMAN` numeric glyphs for the first 3 list nesting levels, followed by parenthesis.",
            "A numbered list with `DECIMAL` numeric glyphs separated by periods, where each nesting level uses the previous nesting level's glyph as a prefix. For example: '1.', '1.1.', '2.', '2.2.'.",
            "A numbered list with `UPPERALPHA`, `ALPHA` and `ROMAN` numeric glyphs for the first 3 list nesting levels, followed by periods.",
            "A numbered list with `UPPERROMAN`, `UPPERALPHA` and `DECIMAL` numeric glyphs for the first 3 list nesting levels, followed by periods.",
            "A numbered list with `ZERODECIMAL`, `ALPHA` and `ROMAN` numeric glyphs for the first 3 list nesting levels, followed by periods."
          ]
        },
        "range": {
          "$ref": "Range",
          "description": "The range to apply the bullet preset to."
        }
      },
      "description": "Creates bullets for all of the paragraphs that overlap with the given range. The nesting level of each paragraph will be determined by counting leading tabs in front of each paragraph. To avoid excess space between the bullet and the corresponding paragraph, these leading tabs are removed by this request. This may change the indices of parts of the text. If the paragraph immediately before paragraphs being updated is in a list with a matching preset, the paragraphs being updated are added to that preceding list."
    },
    "ReplaceNamedRangeContentRequest": {
      "properties": {
        "text": {
          "type": "string",
          "description": "Replaces the content of the specified named range(s) with the given text."
        },
        "namedRangeName": {
          "type": "string",
          "description": "The name of the NamedRanges whose content will be replaced. If there are multiple named ranges with the given name, then the content of each one will be replaced. If there are no named ranges with the given name, then the request will be a no-op."
        },
        "namedRangeId": {
          "description": "The ID of the named range whose content will be replaced. If there is no named range with the given ID a 400 bad request error is returned.",
          "type": "string"
        },
        "tabsCriteria": {
          "description": "Optional. The criteria used to specify in which tabs the replacement occurs. When omitted, the replacement applies to all tabs. In a document containing a single tab: - If provided, must match the singular tab's ID. - If omitted, the replacement applies to the singular tab. In a document containing multiple tabs: - If provided, the replacement applies to the specified tabs. - If omitted, the replacement applies to all tabs.",
          "$ref": "TabsCriteria"
        }
      },
      "description": "Replaces the contents of the specified NamedRange or NamedRanges with the given replacement content. Note that an individual NamedRange may consist of multiple discontinuous ranges. In this case, only the content in the first range will be replaced. The other ranges and their content will be deleted. In cases where replacing or deleting any ranges would result in an invalid document structure, a 400 bad request error is returned.",
      "id": "ReplaceNamedRangeContentRequest",
      "type": "object"
    },
    "NamedStylesSuggestionState": {
      "id": "NamedStylesSuggestionState",
      "properties": {
        "stylesSuggestionStates": {
          "items": {
            "$ref": "NamedStyleSuggestionState"
          },
          "type": "array",
          "description": "A mask that indicates which of the fields on the corresponding NamedStyle in styles have been changed in this suggestion. The order of these named style suggestion states matches the order of the corresponding named style within the named styles suggestion."
        }
      },
      "description": "The suggestion state of a NamedStyles message.",
      "type": "object"
    },
    "NamedStyleSuggestionState": {
      "type": "object",
      "id": "NamedStyleSuggestionState",
      "properties": {
        "textStyleSuggestionState": {
          "$ref": "TextStyleSuggestionState",
          "description": "A mask that indicates which of the fields in text style have been changed in this suggestion."
        },
        "paragraphStyleSuggestionState": {
          "description": "A mask that indicates which of the fields in paragraph style have been changed in this suggestion.",
          "$ref": "ParagraphStyleSuggestionState"
        },
        "namedStyleType": {
          "description": "The named style type that this suggestion state corresponds to. This field is provided as a convenience for matching the NamedStyleSuggestionState with its corresponding NamedStyle.",
          "enumDescriptions": [
            "The type of named style is unspecified.",
            "Normal text.",
            "Title.",
            "Subtitle.",
            "Heading 1.",
            "Heading 2.",
            "Heading 3.",
            "Heading 4.",
            "Heading 5.",
            "Heading 6."
          ],
          "type": "string",
          "enum": [
            "NAMED_STYLE_TYPE_UNSPECIFIED",
            "NORMAL_TEXT",
            "TITLE",
            "SUBTITLE",
            "HEADING_1",
            "HEADING_2",
            "HEADING_3",
            "HEADING_4",
            "HEADING_5",
            "HEADING_6"
          ]
        }
      },
      "description": "A suggestion state of a NamedStyle message."
    },
    "ParagraphStyleSuggestionState": {
      "id": "ParagraphStyleSuggestionState",
      "type": "object",
      "description": "A mask that indicates which of the fields on the base ParagraphStyle have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "properties": {
        "borderRightSuggested": {
          "description": "Indicates if there was a suggested change to border_right.",
          "type": "boolean"
        },
        "spacingModeSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to spacing_mode."
        },
        "indentStartSuggested": {
          "description": "Indicates if there was a suggested change to indent_start.",
          "type": "boolean"
        },
        "borderLeftSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to border_left."
        },
        "keepWithNextSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to keep_with_next."
        },
        "directionSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to direction."
        },
        "indentEndSuggested": {
          "description": "Indicates if there was a suggested change to indent_end.",
          "type": "boolean"
        },
        "borderBetweenSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to border_between."
        },
        "avoidWidowAndOrphanSuggested": {
          "description": "Indicates if there was a suggested change to avoid_widow_and_orphan.",
          "type": "boolean"
        },
        "namedStyleTypeSuggested": {
          "description": "Indicates if there was a suggested change to named_style_type.",
          "type": "boolean"
        },
        "keepLinesTogetherSuggested": {
          "description": "Indicates if there was a suggested change to keep_lines_together.",
          "type": "boolean"
        },
        "alignmentSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to alignment."
        },
        "spaceAboveSuggested": {
          "description": "Indicates if there was a suggested change to space_above.",
          "type": "boolean"
        },
        "indentFirstLineSuggested": {
          "description": "Indicates if there was a suggested change to indent_first_line.",
          "type": "boolean"
        },
        "pageBreakBeforeSuggested": {
          "description": "Indicates if there was a suggested change to page_break_before.",
          "type": "boolean"
        },
        "shadingSuggestionState": {
          "$ref": "ShadingSuggestionState",
          "description": "A mask that indicates which of the fields in shading have been changed in this suggestion."
        },
        "borderTopSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to border_top."
        },
        "borderBottomSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to border_bottom."
        },
        "lineSpacingSuggested": {
          "description": "Indicates if there was a suggested change to line_spacing.",
          "type": "boolean"
        },
        "headingIdSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to heading_id."
        },
        "spaceBelowSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to space_below."
        }
      }
    },
    "ShadingSuggestionState": {
      "id": "ShadingSuggestionState",
      "type": "object",
      "description": "A mask that indicates which of the fields on the base Shading have been changed in this suggested change. For any field set to true, there's a new suggested value.",
      "properties": {
        "backgroundColorSuggested": {
          "description": "Indicates if there was a suggested change to the Shading.",
          "type": "boolean"
        }
      }
    },
    "NamedStyles": {
      "id": "NamedStyles",
      "description": "The named styles. Paragraphs in the document can inherit their TextStyle and ParagraphStyle from these named styles.",
      "properties": {
        "styles": {
          "description": "The named styles. There's an entry for each of the possible named style types.",
          "items": {
            "$ref": "NamedStyle"
          },
          "type": "array"
        }
      },
      "type": "object"
    },
    "PositionedObjectPositioning": {
      "type": "object",
      "properties": {
        "leftOffset": {
          "description": "The offset of the left edge of the positioned object relative to the beginning of the Paragraph it's tethered to. The exact positioning of the object can depend on other content in the document and the document's styling.",
          "$ref": "Dimension"
        },
        "topOffset": {
          "$ref": "Dimension",
          "description": "The offset of the top edge of the positioned object relative to the beginning of the Paragraph it's tethered to. The exact positioning of the object can depend on other content in the document and the document's styling."
        },
        "layout": {
          "enumDescriptions": [
            "The layout is unspecified.",
            "The text wraps around the positioned object.",
            "Breaks text such that the positioned object is on the left and text is on the right.",
            "Breaks text such that the positioned object is on the right and text is on the left.",
            "Breaks text such that there's no text on the left or right of the positioned object.",
            "The positioned object is in front of the text.",
            "The positioned object is behind the text."
          ],
          "description": "The layout of this positioned object.",
          "type": "string",
          "enum": [
            "POSITIONED_OBJECT_LAYOUT_UNSPECIFIED",
            "WRAP_TEXT",
            "BREAK_LEFT",
            "BREAK_RIGHT",
            "BREAK_LEFT_RIGHT",
            "IN_FRONT_OF_TEXT",
            "BEHIND_TEXT"
          ]
        }
      },
      "id": "PositionedObjectPositioning",
      "description": "The positioning of a PositionedObject. The positioned object is positioned relative to the beginning of the Paragraph it's tethered to."
    },
    "Shading": {
      "id": "Shading",
      "type": "object",
      "description": "The shading of a paragraph.",
      "properties": {
        "backgroundColor": {
          "$ref": "OptionalColor",
          "description": "The background color of this paragraph shading."
        }
      }
    },
    "DeleteTableRowRequest": {
      "description": "Deletes a row from a table.",
      "type": "object",
      "properties": {
        "tableCellLocation": {
          "description": "The reference table cell location from which the row will be deleted. The row this cell spans will be deleted. If this is a merged cell that spans multiple rows, all rows that the cell spans will be deleted. If no rows remain in the table after this deletion, the whole table is deleted.",
          "$ref": "TableCellLocation"
        }
      },
      "id": "DeleteTableRowRequest"
    },
    "SuggestedTableCellStyle": {
      "properties": {
        "tableCellStyleSuggestionState": {
          "description": "A mask that indicates which of the fields on the base TableCellStyle have been changed in this suggestion.",
          "$ref": "TableCellStyleSuggestionState"
        },
        "tableCellStyle": {
          "$ref": "TableCellStyle",
          "description": "A TableCellStyle that only includes the changes made in this suggestion. This can be used along with the table_cell_style_suggestion_state to see which fields have changed and their new values."
        }
      },
      "id": "SuggestedTableCellStyle",
      "description": "A suggested change to a TableCellStyle.",
      "type": "object"
    },
    "TableCellStyleSuggestionState": {
      "description": "A mask that indicates which of the fields on the base TableCellStyle have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "id": "TableCellStyleSuggestionState",
      "type": "object",
      "properties": {
        "paddingTopSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to padding_top."
        },
        "backgroundColorSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to background_color."
        },
        "borderBottomSuggested": {
          "description": "Indicates if there was a suggested change to border_bottom.",
          "type": "boolean"
        },
        "paddingRightSuggested": {
          "description": "Indicates if there was a suggested change to padding_right.",
          "type": "boolean"
        },
        "contentAlignmentSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to content_alignment."
        },
        "borderTopSuggested": {
          "description": "Indicates if there was a suggested change to border_top.",
          "type": "boolean"
        },
        "rowSpanSuggested": {
          "description": "Indicates if there was a suggested change to row_span.",
          "type": "boolean"
        },
        "borderRightSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to border_right."
        },
        "paddingBottomSuggested": {
          "description": "Indicates if there was a suggested change to padding_bottom.",
          "type": "boolean"
        },
        "columnSpanSuggested": {
          "description": "Indicates if there was a suggested change to column_span.",
          "type": "boolean"
        },
        "borderLeftSuggested": {
          "description": "Indicates if there was a suggested change to border_left.",
          "type": "boolean"
        },
        "paddingLeftSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to padding_left."
        }
      }
    },
    "InsertRichLinkRequest": {
      "id": "InsertRichLinkRequest",
      "type": "object",
      "properties": {
        "location": {
          "description": "Inserts the rich link at a specific index in the document. The rich link must be inserted inside the bounds of an existing Paragraph. For instance, it cannot be inserted at a table's start index (i.e. between the table and its preceding paragraph). The rich link cannot be inserted inside an equation.",
          "$ref": "Location"
        },
        "richLinkProperties": {
          "description": "The properties of the rich link to insert.",
          "$ref": "RichLinkProperties"
        },
        "endOfSegmentLocation": {
          "$ref": "EndOfSegmentLocation",
          "description": "Inserts the rich link at the end of a header, footer, footnote or the document body."
        }
      },
      "description": "Inserts a RichLink at the specified location."
    },
    "AddDocumentTabRequest": {
      "properties": {
        "tabProperties": {
          "description": "The properties of the tab to add. All properties are optional.",
          "$ref": "TabProperties"
        }
      },
      "type": "object",
      "description": "Adds a document tab. When a tab is added at a given index, all subsequent tabs' indexes are incremented.",
      "id": "AddDocumentTabRequest"
    },
    "SuggestedParagraphStyle": {
      "type": "object",
      "properties": {
        "paragraphStyle": {
          "description": "A ParagraphStyle that only includes the changes made in this suggestion. This can be used along with the paragraph_style_suggestion_state to see which fields have changed and their new values.",
          "$ref": "ParagraphStyle"
        },
        "paragraphStyleSuggestionState": {
          "$ref": "ParagraphStyleSuggestionState",
          "description": "A mask that indicates which of the fields on the base ParagraphStyle have been changed in this suggestion."
        }
      },
      "description": "A suggested change to a ParagraphStyle.",
      "id": "SuggestedParagraphStyle"
    },
    "SuggestedDocumentStyle": {
      "type": "object",
      "properties": {
        "documentStyle": {
          "$ref": "DocumentStyle",
          "description": "A DocumentStyle that only includes the changes made in this suggestion. This can be used along with the document_style_suggestion_state to see which fields have changed and their new values."
        },
        "documentStyleSuggestionState": {
          "description": "A mask that indicates which of the fields on the base DocumentStyle have been changed in this suggestion.",
          "$ref": "DocumentStyleSuggestionState"
        }
      },
      "description": "A suggested change to the DocumentStyle.",
      "id": "SuggestedDocumentStyle"
    },
    "DocumentStyleSuggestionState": {
      "type": "object",
      "description": "A mask that indicates which of the fields on the base DocumentStyle have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "properties": {
        "flipPageOrientationSuggested": {
          "type": "boolean",
          "description": "Optional. Indicates if there was a suggested change to flip_page_orientation."
        },
        "marginFooterSuggested": {
          "description": "Indicates if there was a suggested change to margin_footer.",
          "type": "boolean"
        },
        "pageNumberStartSuggested": {
          "description": "Indicates if there was a suggested change to page_number_start.",
          "type": "boolean"
        },
        "marginHeaderSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to margin_header."
        },
        "marginRightSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to margin_right."
        },
        "evenPageHeaderIdSuggested": {
          "description": "Indicates if there was a suggested change to even_page_header_id.",
          "type": "boolean"
        },
        "marginTopSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to margin_top."
        },
        "pageSizeSuggestionState": {
          "$ref": "SizeSuggestionState",
          "description": "A mask that indicates which of the fields in size have been changed in this suggestion."
        },
        "firstPageHeaderIdSuggested": {
          "description": "Indicates if there was a suggested change to first_page_header_id.",
          "type": "boolean"
        },
        "marginLeftSuggested": {
          "description": "Indicates if there was a suggested change to margin_left.",
          "type": "boolean"
        },
        "defaultFooterIdSuggested": {
          "description": "Indicates if there was a suggested change to default_footer_id.",
          "type": "boolean"
        },
        "evenPageFooterIdSuggested": {
          "description": "Indicates if there was a suggested change to even_page_footer_id.",
          "type": "boolean"
        },
        "backgroundSuggestionState": {
          "$ref": "BackgroundSuggestionState",
          "description": "A mask that indicates which of the fields in background have been changed in this suggestion."
        },
        "useEvenPageHeaderFooterSuggested": {
          "description": "Indicates if there was a suggested change to use_even_page_header_footer.",
          "type": "boolean"
        },
        "defaultHeaderIdSuggested": {
          "description": "Indicates if there was a suggested change to default_header_id.",
          "type": "boolean"
        },
        "useFirstPageHeaderFooterSuggested": {
          "description": "Indicates if there was a suggested change to use_first_page_header_footer.",
          "type": "boolean"
        },
        "useCustomHeaderFooterMarginsSuggested": {
          "description": "Indicates if there was a suggested change to use_custom_header_footer_margins.",
          "type": "boolean"
        },
        "firstPageFooterIdSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to first_page_footer_id."
        },
        "marginBottomSuggested": {
          "description": "Indicates if there was a suggested change to margin_bottom.",
          "type": "boolean"
        }
      },
      "id": "DocumentStyleSuggestionState"
    },
    "PinTableHeaderRowsRequest": {
      "type": "object",
      "id": "PinTableHeaderRowsRequest",
      "properties": {
        "pinnedHeaderRowsCount": {
          "description": "The number of table rows to pin, where 0 implies that all rows are unpinned.",
          "type": "integer",
          "format": "int32"
        },
        "tableStartLocation": {
          "description": "The location where the table starts in the document.",
          "$ref": "Location"
        }
      },
      "description": "Updates the number of pinned table header rows in a table."
    },
    "Tab": {
      "id": "Tab",
      "type": "object",
      "description": "A tab in a document.",
      "properties": {
        "documentTab": {
          "description": "A tab with document contents, like text and images.",
          "$ref": "DocumentTab"
        },
        "tabProperties": {
          "description": "The properties of the tab, like ID and title.",
          "$ref": "TabProperties"
        },
        "childTabs": {
          "items": {
            "$ref": "Tab"
          },
          "type": "array",
          "description": "The child tabs nested within this tab."
        }
      }
    },
    "DocumentTab": {
      "properties": {
        "inlineObjects": {
          "additionalProperties": {
            "$ref": "InlineObject"
          },
          "type": "object",
          "description": "The inline objects in the document tab, keyed by object ID."
        },
        "namedRanges": {
          "additionalProperties": {
            "$ref": "NamedRanges"
          },
          "description": "The named ranges in the document tab, keyed by name.",
          "type": "object"
        },
        "lists": {
          "description": "The lists in the document tab, keyed by list ID.",
          "additionalProperties": {
            "$ref": "List"
          },
          "type": "object"
        },
        "documentStyle": {
          "description": "The style of the document tab.",
          "$ref": "DocumentStyle"
        },
        "namedStyles": {
          "$ref": "NamedStyles",
          "description": "The named styles of the document tab."
        },
        "footnotes": {
          "type": "object",
          "additionalProperties": {
            "$ref": "Footnote"
          },
          "description": "The footnotes in the document tab, keyed by footnote ID."
        },
        "footers": {
          "type": "object",
          "description": "The footers in the document tab, keyed by footer ID.",
          "additionalProperties": {
            "$ref": "Footer"
          }
        },
        "positionedObjects": {
          "type": "object",
          "additionalProperties": {
            "$ref": "PositionedObject"
          },
          "description": "The positioned objects in the document tab, keyed by object ID."
        },
        "headers": {
          "description": "The headers in the document tab, keyed by header ID.",
          "additionalProperties": {
            "$ref": "Header"
          },
          "type": "object"
        },
        "body": {
          "description": "The main body of the document tab.",
          "$ref": "Body"
        },
        "suggestedDocumentStyleChanges": {
          "description": "The suggested changes to the style of the document tab, keyed by suggestion ID.",
          "type": "object",
          "additionalProperties": {
            "$ref": "SuggestedDocumentStyle"
          }
        },
        "suggestedNamedStylesChanges": {
          "type": "object",
          "additionalProperties": {
            "$ref": "SuggestedNamedStyles"
          },
          "description": "The suggested changes to the named styles of the document tab, keyed by suggestion ID."
        }
      },
      "description": "A tab with document contents.",
      "type": "object",
      "id": "DocumentTab"
    },
    "CreateHeaderResponse": {
      "properties": {
        "headerId": {
          "description": "The ID of the created header.",
          "type": "string"
        }
      },
      "description": "The result of creating a header.",
      "id": "CreateHeaderResponse",
      "type": "object"
    },
    "InsertPageBreakRequest": {
      "id": "InsertPageBreakRequest",
      "type": "object",
      "description": "Inserts a page break followed by a newline at the specified location.",
      "properties": {
        "endOfSegmentLocation": {
          "$ref": "EndOfSegmentLocation",
          "description": "Inserts the page break at the end of the document body. Page breaks cannot be inserted inside a footnote, header or footer. Since page breaks can only be inserted inside the body, the segment ID field must be empty."
        },
        "location": {
          "description": "Inserts the page break at a specific index in the document. The page break must be inserted inside the bounds of an existing Paragraph. For instance, it cannot be inserted at a table's start index (i.e. between the table and its preceding paragraph). Page breaks cannot be inserted inside a table, equation, footnote, header or footer. Since page breaks can only be inserted inside the body, the segment ID field must be empty.",
          "$ref": "Location"
        }
      }
    },
    "Footnote": {
      "description": "A document footnote.",
      "properties": {
        "content": {
          "description": "The contents of the footnote. The indexes for a footnote's content begin at zero.",
          "type": "array",
          "items": {
            "$ref": "StructuralElement"
          }
        },
        "footnoteId": {
          "type": "string",
          "description": "The ID of the footnote."
        }
      },
      "type": "object",
      "id": "Footnote"
    },
    "SectionColumnProperties": {
      "id": "SectionColumnProperties",
      "properties": {
        "width": {
          "$ref": "Dimension",
          "description": "Output only. The width of the column."
        },
        "paddingEnd": {
          "$ref": "Dimension",
          "description": "The padding at the end of the column."
        }
      },
      "type": "object",
      "description": "Properties that apply to a section's column."
    },
    "CreateNamedRangeResponse": {
      "properties": {
        "namedRangeId": {
          "type": "string",
          "description": "The ID of the created named range."
        }
      },
      "id": "CreateNamedRangeResponse",
      "type": "object",
      "description": "The result of creating a named range."
    },
    "RichLinkProperties": {
      "properties": {
        "uri": {
          "description": "The URI to the RichLink. This is always present.",
          "type": "string"
        },
        "title": {
          "type": "string",
          "description": "The title of the RichLink as displayed in the link. This title matches the title of the linked resource at the time of the insertion or last update of the link. This field is always present."
        },
        "mimeType": {
          "description": "The [MIME type](https://developers.google.com/drive/api/v3/mime-types) of the RichLink, if there's one (for example, when it's a file in Drive).",
          "type": "string"
        }
      },
      "description": "Properties specific to a RichLink.",
      "id": "RichLinkProperties",
      "type": "object"
    },
    "SizeSuggestionState": {
      "id": "SizeSuggestionState",
      "description": "A mask that indicates which of the fields on the base Size have been changed in this suggestion. For any field set to true, the Size has a new suggested value.",
      "properties": {
        "widthSuggested": {
          "description": "Indicates if there was a suggested change to width.",
          "type": "boolean"
        },
        "heightSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to height."
        }
      },
      "type": "object"
    },
    "DeleteNamedRangeRequest": {
      "id": "DeleteNamedRangeRequest",
      "properties": {
        "namedRangeId": {
          "description": "The ID of the named range to delete.",
          "type": "string"
        },
        "tabsCriteria": {
          "description": "Optional. The criteria used to specify which tab(s) the range deletion should occur in. When omitted, the range deletion is applied to all tabs. In a document containing a single tab: - If provided, must match the singular tab's ID. - If omitted, the range deletion applies to the singular tab. In a document containing multiple tabs: - If provided, the range deletion applies to the specified tabs. - If not provided, the range deletion applies to all tabs.",
          "$ref": "TabsCriteria"
        },
        "name": {
          "type": "string",
          "description": "The name of the range(s) to delete. All named ranges with the given name will be deleted."
        }
      },
      "type": "object",
      "description": "Deletes a NamedRange."
    },
    "DocumentStyle": {
      "properties": {
        "marginBottom": {
          "description": "The bottom page margin. Updating the bottom page margin on the document style clears the bottom page margin on all section styles. If DocumentMode is PAGELESS, this property will not be rendered.",
          "$ref": "Dimension"
        },
        "background": {
          "description": "The background of the document. Documents cannot have a transparent background color.",
          "$ref": "Background"
        },
        "evenPageHeaderId": {
          "type": "string",
          "description": "The ID of the header used only for even pages. The value of use_even_page_header_footer determines whether to use the default_header_id or this value for the header on even pages. If not set, there's no even page header. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only."
        },
        "evenPageFooterId": {
          "description": "The ID of the footer used only for even pages. The value of use_even_page_header_footer determines whether to use the default_footer_id or this value for the footer on even pages. If not set, there's no even page footer. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only.",
          "type": "string"
        },
        "marginHeader": {
          "$ref": "Dimension",
          "description": "The amount of space between the top of the page and the contents of the header. If DocumentMode is PAGELESS, this property will not be rendered."
        },
        "flipPageOrientation": {
          "type": "boolean",
          "description": "Optional. Indicates whether to flip the dimensions of the page_size, which allows changing the page orientation between portrait and landscape. If DocumentMode is PAGELESS, this property will not be rendered."
        },
        "firstPageHeaderId": {
          "description": "The ID of the header used only for the first page. If not set then a unique header for the first page does not exist. The value of use_first_page_header_footer determines whether to use the default_header_id or this value for the header on the first page. If not set, there's no first page header. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only.",
          "type": "string"
        },
        "marginFooter": {
          "description": "The amount of space between the bottom of the page and the contents of the footer. If DocumentMode is PAGELESS, this property will not be rendered.",
          "$ref": "Dimension"
        },
        "marginRight": {
          "$ref": "Dimension",
          "description": "The right page margin. Updating the right page margin on the document style clears the right page margin on all section styles. It may also cause columns to resize in all sections. If DocumentMode is PAGELESS, this property will not be rendered."
        },
        "defaultFooterId": {
          "description": "The ID of the default footer. If not set, there's no default footer. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only.",
          "type": "string"
        },
        "marginLeft": {
          "$ref": "Dimension",
          "description": "The left page margin. Updating the left page margin on the document style clears the left page margin on all section styles. It may also cause columns to resize in all sections. If DocumentMode is PAGELESS, this property will not be rendered."
        },
        "firstPageFooterId": {
          "type": "string",
          "description": "The ID of the footer used only for the first page. If not set then a unique footer for the first page does not exist. The value of use_first_page_header_footer determines whether to use the default_footer_id or this value for the footer on the first page. If not set, there's no first page footer. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only."
        },
        "pageNumberStart": {
          "format": "int32",
          "description": "The page number from which to start counting the number of pages. If DocumentMode is PAGELESS, this property will not be rendered.",
          "type": "integer"
        },
        "useCustomHeaderFooterMargins": {
          "description": "Indicates whether DocumentStyle margin_header, SectionStyle margin_header and DocumentStyle margin_footer, SectionStyle margin_footer are respected. When false, the default values in the Docs editor for header and footer margin is used. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only.",
          "type": "boolean"
        },
        "documentFormat": {
          "$ref": "DocumentFormat",
          "description": "Specifies document-level format settings, such as the document mode (pages vs pageless)."
        },
        "useFirstPageHeaderFooter": {
          "type": "boolean",
          "description": "Indicates whether to use the first page header / footer IDs for the first page. If DocumentMode is PAGELESS, this property will not be rendered."
        },
        "pageSize": {
          "$ref": "Size",
          "description": "The size of a page in the document. If DocumentMode is PAGELESS, this property will not be rendered."
        },
        "marginTop": {
          "$ref": "Dimension",
          "description": "The top page margin. Updating the top page margin on the document style clears the top page margin on all section styles. If DocumentMode is PAGELESS, this property will not be rendered."
        },
        "useEvenPageHeaderFooter": {
          "type": "boolean",
          "description": "Indicates whether to use the even page header / footer IDs for the even pages. If DocumentMode is PAGELESS, this property will not be rendered."
        },
        "defaultHeaderId": {
          "type": "string",
          "description": "The ID of the default header. If not set, there's no default header. If DocumentMode is PAGELESS, this property will not be rendered. This property is read-only."
        }
      },
      "id": "DocumentStyle",
      "description": "The style of the document.",
      "type": "object"
    },
    "DocumentFormat": {
      "properties": {
        "documentMode": {
          "type": "string",
          "enum": [
            "DOCUMENT_MODE_UNSPECIFIED",
            "PAGES",
            "PAGELESS"
          ],
          "description": "Whether the document has pages or is pageless.",
          "enumDescriptions": [
            "The document mode is unspecified.",
            "The document has pages.",
            "The document is pageless."
          ]
        }
      },
      "type": "object",
      "id": "DocumentFormat",
      "description": "Represents document-level format settings."
    },
    "BackgroundSuggestionState": {
      "properties": {
        "backgroundColorSuggested": {
          "type": "boolean",
          "description": "Indicates whether the current background color has been modified in this suggestion."
        }
      },
      "type": "object",
      "id": "BackgroundSuggestionState",
      "description": "A mask that indicates which of the fields on the base Background have been changed in this suggestion. For any field set to true, the Backgound has a new suggested value."
    },
    "TableCellStyle": {
      "properties": {
        "paddingTop": {
          "description": "The top padding of the cell.",
          "$ref": "Dimension"
        },
        "columnSpan": {
          "format": "int32",
          "description": "The column span of the cell. This property is read-only.",
          "type": "integer"
        },
        "paddingRight": {
          "description": "The right padding of the cell.",
          "$ref": "Dimension"
        },
        "paddingBottom": {
          "$ref": "Dimension",
          "description": "The bottom padding of the cell."
        },
        "borderTop": {
          "description": "The top border of the cell.",
          "$ref": "TableCellBorder"
        },
        "rowSpan": {
          "description": "The row span of the cell. This property is read-only.",
          "type": "integer",
          "format": "int32"
        },
        "borderLeft": {
          "$ref": "TableCellBorder",
          "description": "The left border of the cell."
        },
        "backgroundColor": {
          "description": "The background color of the cell.",
          "$ref": "OptionalColor"
        },
        "paddingLeft": {
          "description": "The left padding of the cell.",
          "$ref": "Dimension"
        },
        "borderBottom": {
          "description": "The bottom border of the cell.",
          "$ref": "TableCellBorder"
        },
        "borderRight": {
          "$ref": "TableCellBorder",
          "description": "The right border of the cell."
        },
        "contentAlignment": {
          "description": "The alignment of the content in the table cell. The default alignment matches the alignment for newly created table cells in the Docs editor.",
          "type": "string",
          "enum": [
            "CONTENT_ALIGNMENT_UNSPECIFIED",
            "CONTENT_ALIGNMENT_UNSUPPORTED",
            "TOP",
            "MIDDLE",
            "BOTTOM"
          ],
          "enumDescriptions": [
            "An unspecified content alignment. The content alignment is inherited from the parent if one exists.",
            "An unsupported content alignment.",
            "An alignment that aligns the content to the top of the content holder. Corresponds to ECMA-376 ST_TextAnchoringType 't'.",
            "An alignment that aligns the content to the middle of the content holder. Corresponds to ECMA-376 ST_TextAnchoringType 'ctr'.",
            "An alignment that aligns the content to the bottom of the content holder. Corresponds to ECMA-376 ST_TextAnchoringType 'b'."
          ]
        }
      },
      "type": "object",
      "id": "TableCellStyle",
      "description": "The style of a TableCell. Inherited table cell styles are represented as unset fields in this message. A table cell style can inherit from the table's style."
    },
    "HeadingLink": {
      "properties": {
        "id": {
          "description": "The ID of a heading in this document.",
          "type": "string"
        },
        "tabId": {
          "description": "The ID of the tab containing this heading.",
          "type": "string"
        }
      },
      "type": "object",
      "description": "A reference to a heading in this document.",
      "id": "HeadingLink"
    },
    "ObjectReferences": {
      "description": "A collection of object IDs.",
      "id": "ObjectReferences",
      "properties": {
        "objectIds": {
          "description": "The object IDs.",
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "type": "object"
    },
    "ParagraphElement": {
      "type": "object",
      "id": "ParagraphElement",
      "properties": {
        "pageBreak": {
          "description": "A page break paragraph element.",
          "$ref": "PageBreak"
        },
        "endIndex": {
          "format": "int32",
          "type": "integer",
          "description": "The zero-base end index of this paragraph element, exclusive, in UTF-16 code units."
        },
        "inlineObjectElement": {
          "$ref": "InlineObjectElement",
          "description": "An inline object paragraph element."
        },
        "footnoteReference": {
          "description": "A footnote reference paragraph element.",
          "$ref": "FootnoteReference"
        },
        "horizontalRule": {
          "description": "A horizontal rule paragraph element.",
          "$ref": "HorizontalRule"
        },
        "dateElement": {
          "$ref": "DateElement",
          "description": "A paragraph element that represents a date."
        },
        "equation": {
          "description": "An equation paragraph element.",
          "$ref": "Equation"
        },
        "textRun": {
          "description": "A text run paragraph element.",
          "$ref": "TextRun"
        },
        "columnBreak": {
          "description": "A column break paragraph element.",
          "$ref": "ColumnBreak"
        },
        "startIndex": {
          "type": "integer",
          "format": "int32",
          "description": "The zero-based start index of this paragraph element, in UTF-16 code units."
        },
        "autoText": {
          "description": "An auto text paragraph element.",
          "$ref": "AutoText"
        },
        "person": {
          "description": "A paragraph element that links to a person or email address.",
          "$ref": "Person"
        },
        "richLink": {
          "description": "A paragraph element that links to a Google resource (such as a file in Google Drive, a YouTube video, or a Calendar event.)",
          "$ref": "RichLink"
        }
      },
      "description": "A ParagraphElement describes content within a Paragraph."
    },
    "InlineObjectElement": {
      "id": "InlineObjectElement",
      "properties": {
        "textStyle": {
          "$ref": "TextStyle",
          "description": "The text style of this InlineObjectElement. Similar to text content, like text runs and footnote references, the text style of an inline object element can affect content layout as well as the styling of text inserted next to it."
        },
        "inlineObjectId": {
          "description": "The ID of the InlineObject this element contains.",
          "type": "string"
        },
        "suggestedDeletionIds": {
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content.",
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "suggestedTextStyleChanges": {
          "additionalProperties": {
            "$ref": "SuggestedTextStyle"
          },
          "description": "The suggested text style changes to this InlineObject, keyed by suggestion ID.",
          "type": "object"
        },
        "suggestedInsertionIds": {
          "description": "The suggested insertion IDs. An InlineObjectElement may have multiple insertion IDs if it's a nested suggested change. If empty, then this is not a suggested insertion.",
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "type": "object",
      "description": "A ParagraphElement that contains an InlineObject."
    },
    "FootnoteReference": {
      "description": "A ParagraphElement representing a footnote reference. A footnote reference is the inline content rendered with a number and is used to identify the footnote.",
      "id": "FootnoteReference",
      "type": "object",
      "properties": {
        "suggestedTextStyleChanges": {
          "description": "The suggested text style changes to this FootnoteReference, keyed by suggestion ID.",
          "additionalProperties": {
            "$ref": "SuggestedTextStyle"
          },
          "type": "object"
        },
        "textStyle": {
          "description": "The text style of this FootnoteReference.",
          "$ref": "TextStyle"
        },
        "suggestedDeletionIds": {
          "items": {
            "type": "string"
          },
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content.",
          "type": "array"
        },
        "suggestedInsertionIds": {
          "items": {
            "type": "string"
          },
          "type": "array",
          "description": "The suggested insertion IDs. A FootnoteReference may have multiple insertion IDs if it's a nested suggested change. If empty, then this is not a suggested insertion."
        },
        "footnoteId": {
          "type": "string",
          "description": "The ID of the footnote that contains the content of this footnote reference."
        },
        "footnoteNumber": {
          "description": "The rendered number of this footnote.",
          "type": "string"
        }
      }
    },
    "HorizontalRule": {
      "properties": {
        "suggestedTextStyleChanges": {
          "description": "The suggested text style changes to this HorizontalRule, keyed by suggestion ID.",
          "type": "object",
          "additionalProperties": {
            "$ref": "SuggestedTextStyle"
          }
        },
        "suggestedDeletionIds": {
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content.",
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "suggestedInsertionIds": {
          "description": "The suggested insertion IDs. A HorizontalRule may have multiple insertion IDs if it is a nested suggested change. If empty, then this is not a suggested insertion.",
          "items": {
            "type": "string"
          },
          "type": "array"
        },
        "textStyle": {
          "description": "The text style of this HorizontalRule. Similar to text content, like text runs and footnote references, the text style of a horizontal rule can affect content layout as well as the styling of text inserted next to it.",
          "$ref": "TextStyle"
        }
      },
      "description": "A ParagraphElement representing a horizontal line.",
      "type": "object",
      "id": "HorizontalRule"
    },
    "AutoText": {
      "id": "AutoText",
      "description": "A ParagraphElement representing a spot in the text that's dynamically replaced with content that can change over time, like a page number.",
      "type": "object",
      "properties": {
        "type": {
          "description": "The type of this auto text.",
          "type": "string",
          "enum": [
            "TYPE_UNSPECIFIED",
            "PAGE_NUMBER",
            "PAGE_COUNT"
          ],
          "enumDescriptions": [
            "An unspecified auto text type.",
            "Type for auto text that represents the current page number.",
            "Type for auto text that represents the total number of pages in the document."
          ]
        },
        "suggestedInsertionIds": {
          "items": {
            "type": "string"
          },
          "type": "array",
          "description": "The suggested insertion IDs. An AutoText may have multiple insertion IDs if it's a nested suggested change. If empty, then this is not a suggested insertion."
        },
        "suggestedDeletionIds": {
          "items": {
            "type": "string"
          },
          "type": "array",
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content."
        },
        "textStyle": {
          "$ref": "TextStyle",
          "description": "The text style of this AutoText."
        },
        "suggestedTextStyleChanges": {
          "additionalProperties": {
            "$ref": "SuggestedTextStyle"
          },
          "description": "The suggested text style changes to this AutoText, keyed by suggestion ID.",
          "type": "object"
        }
      }
    },
    "Background": {
      "type": "object",
      "description": "Represents the background of a document.",
      "id": "Background",
      "properties": {
        "color": {
          "$ref": "OptionalColor",
          "description": "The background color."
        }
      }
    },
    "TableCellBorder": {
      "description": "A border around a table cell. Table cell borders cannot be transparent. To hide a table cell border, make its width 0.",
      "properties": {
        "color": {
          "$ref": "OptionalColor",
          "description": "The color of the border. This color cannot be transparent."
        },
        "width": {
          "description": "The width of the border.",
          "$ref": "Dimension"
        },
        "dashStyle": {
          "enumDescriptions": [
            "Unspecified dash style.",
            "Solid line. Corresponds to ECMA-376 ST_PresetLineDashVal value 'solid'. This is the default dash style.",
            "Dotted line. Corresponds to ECMA-376 ST_PresetLineDashVal value 'dot'.",
            "Dashed line. Corresponds to ECMA-376 ST_PresetLineDashVal value 'dash'."
          ],
          "description": "The dash style of the border.",
          "type": "string",
          "enum": [
            "DASH_STYLE_UNSPECIFIED",
            "SOLID",
            "DOT",
            "DASH"
          ]
        }
      },
      "type": "object",
      "id": "TableCellBorder"
    },
    "TextRun": {
      "type": "object",
      "description": "A ParagraphElement that represents a run of text that all has the same styling.",
      "id": "TextRun",
      "properties": {
        "content": {
          "type": "string",
          "description": "The text of this run. Any non-text elements in the run are replaced with the Unicode character U+E907."
        },
        "textStyle": {
          "$ref": "TextStyle",
          "description": "The text style of this run."
        },
        "suggestedDeletionIds": {
          "type": "array",
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content.",
          "items": {
            "type": "string"
          }
        },
        "suggestedInsertionIds": {
          "description": "The suggested insertion IDs. A TextRun may have multiple insertion IDs if it's a nested suggested change. If empty, then this is not a suggested insertion.",
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "suggestedTextStyleChanges": {
          "description": "The suggested text style changes to this run, keyed by suggestion ID.",
          "additionalProperties": {
            "$ref": "SuggestedTextStyle"
          },
          "type": "object"
        }
      }
    },
    "RichLink": {
      "description": "A link to a Google resource (such as a file in Drive, a YouTube video, or a Calendar event).",
      "id": "RichLink",
      "type": "object",
      "properties": {
        "suggestedTextStyleChanges": {
          "type": "object",
          "additionalProperties": {
            "$ref": "SuggestedTextStyle"
          },
          "description": "The suggested text style changes to this RichLink, keyed by suggestion ID."
        },
        "textStyle": {
          "description": "The text style of this RichLink.",
          "$ref": "TextStyle"
        },
        "richLinkProperties": {
          "description": "Output only. The properties of this RichLink. This field is always present.",
          "readOnly": true,
          "$ref": "RichLinkProperties"
        },
        "suggestedInsertionIds": {
          "items": {
            "type": "string"
          },
          "description": "IDs for suggestions that insert this link into the document. A RichLink might have multiple insertion IDs if it's a nested suggested change (a suggestion within a suggestion made by a different user, for example). If empty, then this person link isn't a suggested insertion.",
          "type": "array"
        },
        "richLinkId": {
          "readOnly": true,
          "type": "string",
          "description": "Output only. The ID of this link."
        },
        "suggestedDeletionIds": {
          "items": {
            "type": "string"
          },
          "description": "IDs for suggestions that remove this link from the document. A RichLink might have multiple deletion IDs if, for example, multiple users suggest deleting it. If empty, then this person link isn't suggested for deletion.",
          "type": "array"
        }
      }
    },
    "Equation": {
      "description": "A ParagraphElement representing an equation.",
      "id": "Equation",
      "properties": {
        "suggestedDeletionIds": {
          "items": {
            "type": "string"
          },
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content.",
          "type": "array"
        },
        "suggestedInsertionIds": {
          "description": "The suggested insertion IDs. An Equation may have multiple insertion IDs if it's a nested suggested change. If empty, then this is not a suggested insertion.",
          "items": {
            "type": "string"
          },
          "type": "array"
        }
      },
      "type": "object"
    },
    "SuggestedTextStyle": {
      "description": "A suggested change to a TextStyle.",
      "type": "object",
      "properties": {
        "textStyleSuggestionState": {
          "description": "A mask that indicates which of the fields on the base TextStyle have been changed in this suggestion.",
          "$ref": "TextStyleSuggestionState"
        },
        "textStyle": {
          "$ref": "TextStyle",
          "description": "A TextStyle that only includes the changes made in this suggestion. This can be used along with the text_style_suggestion_state to see which fields have changed and their new values."
        }
      },
      "id": "SuggestedTextStyle"
    },
    "ColumnBreak": {
      "id": "ColumnBreak",
      "type": "object",
      "properties": {
        "textStyle": {
          "$ref": "TextStyle",
          "description": "The text style of this ColumnBreak. Similar to text content, like text runs and footnote references, the text style of a column break can affect content layout as well as the styling of text inserted next to it."
        },
        "suggestedInsertionIds": {
          "type": "array",
          "description": "The suggested insertion IDs. A ColumnBreak may have multiple insertion IDs if it's a nested suggested change. If empty, then this is not a suggested insertion.",
          "items": {
            "type": "string"
          }
        },
        "suggestedTextStyleChanges": {
          "additionalProperties": {
            "$ref": "SuggestedTextStyle"
          },
          "type": "object",
          "description": "The suggested text style changes to this ColumnBreak, keyed by suggestion ID."
        },
        "suggestedDeletionIds": {
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content.",
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "description": "A ParagraphElement representing a column break. A column break makes the subsequent text start at the top of the next column."
    },
    "Person": {
      "id": "Person",
      "properties": {
        "suggestedInsertionIds": {
          "type": "array",
          "description": "IDs for suggestions that insert this person link into the document. A Person might have multiple insertion IDs if it's a nested suggested change (a suggestion within a suggestion made by a different user, for example). If empty, then this person link isn't a suggested insertion.",
          "items": {
            "type": "string"
          }
        },
        "personId": {
          "readOnly": true,
          "description": "Output only. The unique ID of this link.",
          "type": "string"
        },
        "suggestedDeletionIds": {
          "description": "IDs for suggestions that remove this person link from the document. A Person might have multiple deletion IDs if, for example, multiple users suggest deleting it. If empty, then this person link isn't suggested for deletion.",
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "suggestedTextStyleChanges": {
          "description": "The suggested text style changes to this Person, keyed by suggestion ID.",
          "additionalProperties": {
            "$ref": "SuggestedTextStyle"
          },
          "type": "object"
        },
        "personProperties": {
          "$ref": "PersonProperties",
          "readOnly": true,
          "description": "Output only. The properties of this Person. This field is always present."
        },
        "textStyle": {
          "description": "The text style of this Person.",
          "$ref": "TextStyle"
        }
      },
      "description": "A person or email address mentioned in a document. These mentions behave as a single, immutable element containing the person's name or email address.",
      "type": "object"
    },
    "PageBreak": {
      "description": "A ParagraphElement representing a page break. A page break makes the subsequent text start at the top of the next page.",
      "properties": {
        "textStyle": {
          "$ref": "TextStyle",
          "description": "The text style of this PageBreak. Similar to text content, like text runs and footnote references, the text style of a page break can affect content layout as well as the styling of text inserted next to it."
        },
        "suggestedInsertionIds": {
          "type": "array",
          "description": "The suggested insertion IDs. A PageBreak may have multiple insertion IDs if it's a nested suggested change. If empty, then this is not a suggested insertion.",
          "items": {
            "type": "string"
          }
        },
        "suggestedDeletionIds": {
          "items": {
            "type": "string"
          },
          "type": "array",
          "description": "The suggested deletion IDs. If empty, then there are no suggested deletions of this content."
        },
        "suggestedTextStyleChanges": {
          "description": "The suggested text style changes to this PageBreak, keyed by suggestion ID.",
          "additionalProperties": {
            "$ref": "SuggestedTextStyle"
          },
          "type": "object"
        }
      },
      "id": "PageBreak",
      "type": "object"
    },
    "DateElement": {
      "type": "object",
      "properties": {
        "suggestedTextStyleChanges": {
          "additionalProperties": {
            "$ref": "SuggestedTextStyle"
          },
          "description": "The suggested text style changes to this DateElement, keyed by suggestion ID.",
          "type": "object"
        },
        "dateElementProperties": {
          "description": "The properties of this DateElement.",
          "$ref": "DateElementProperties"
        },
        "suggestedDateElementPropertiesChanges": {
          "additionalProperties": {
            "$ref": "SuggestedDateElementProperties"
          },
          "description": "The suggested changes to the date element properties, keyed by suggestion ID.",
          "type": "object"
        },
        "dateId": {
          "readOnly": true,
          "type": "string",
          "description": "Output only. The unique ID of this date."
        },
        "suggestedInsertionIds": {
          "type": "array",
          "description": "IDs for suggestions that insert this date into the document. A DateElement might have multiple insertion IDs if it's a nested suggested change (a suggestion within a suggestion made by a different user, for example). If empty, then this date isn't a suggested insertion.",
          "items": {
            "type": "string"
          }
        },
        "textStyle": {
          "$ref": "TextStyle",
          "description": "The text style of this DateElement."
        },
        "suggestedDeletionIds": {
          "description": "IDs for suggestions that remove this date from the document. A DateElement might have multiple deletion IDs if, for example, multiple users suggest deleting it. If empty, then this date isn't suggested for deletion.",
          "items": {
            "type": "string"
          },
          "type": "array"
        }
      },
      "description": "A date instance mentioned in a document.",
      "id": "DateElement"
    },
    "EmbeddedObjectSuggestionState": {
      "id": "EmbeddedObjectSuggestionState",
      "type": "object",
      "description": "A mask that indicates which of the fields on the base EmbeddedObject have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "properties": {
        "marginTopSuggested": {
          "description": "Indicates if there was a suggested change to margin_top.",
          "type": "boolean"
        },
        "marginRightSuggested": {
          "description": "Indicates if there was a suggested change to margin_right.",
          "type": "boolean"
        },
        "embeddedDrawingPropertiesSuggestionState": {
          "description": "A mask that indicates which of the fields in embedded_drawing_properties have been changed in this suggestion.",
          "$ref": "EmbeddedDrawingPropertiesSuggestionState"
        },
        "imagePropertiesSuggestionState": {
          "$ref": "ImagePropertiesSuggestionState",
          "description": "A mask that indicates which of the fields in image_properties have been changed in this suggestion."
        },
        "linkedContentReferenceSuggestionState": {
          "$ref": "LinkedContentReferenceSuggestionState",
          "description": "A mask that indicates which of the fields in linked_content_reference have been changed in this suggestion."
        },
        "descriptionSuggested": {
          "description": "Indicates if there was a suggested change to description.",
          "type": "boolean"
        },
        "embeddedObjectBorderSuggestionState": {
          "description": "A mask that indicates which of the fields in embedded_object_border have been changed in this suggestion.",
          "$ref": "EmbeddedObjectBorderSuggestionState"
        },
        "titleSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to title."
        },
        "marginLeftSuggested": {
          "description": "Indicates if there was a suggested change to margin_left.",
          "type": "boolean"
        },
        "marginBottomSuggested": {
          "description": "Indicates if there was a suggested change to margin_bottom.",
          "type": "boolean"
        },
        "sizeSuggestionState": {
          "$ref": "SizeSuggestionState",
          "description": "A mask that indicates which of the fields in size have been changed in this suggestion."
        }
      }
    },
    "EmbeddedDrawingPropertiesSuggestionState": {
      "description": "A mask that indicates which of the fields on the base EmbeddedDrawingProperties have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "id": "EmbeddedDrawingPropertiesSuggestionState",
      "type": "object",
      "properties": {}
    },
    "EmbeddedObjectBorderSuggestionState": {
      "properties": {
        "propertyStateSuggested": {
          "description": "Indicates if there was a suggested change to property_state.",
          "type": "boolean"
        },
        "colorSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to color."
        },
        "dashStyleSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to dash_style."
        },
        "widthSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to width."
        }
      },
      "description": "A mask that indicates which of the fields on the base EmbeddedObjectBorder have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "type": "object",
      "id": "EmbeddedObjectBorderSuggestionState"
    },
    "ImagePropertiesSuggestionState": {
      "description": "A mask that indicates which of the fields on the base ImageProperties have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "id": "ImagePropertiesSuggestionState",
      "properties": {
        "cropPropertiesSuggestionState": {
          "$ref": "CropPropertiesSuggestionState",
          "description": "A mask that indicates which of the fields in crop_properties have been changed in this suggestion."
        },
        "brightnessSuggested": {
          "description": "Indicates if there was a suggested change to brightness.",
          "type": "boolean"
        },
        "sourceUriSuggested": {
          "description": "Indicates if there was a suggested change to source_uri.",
          "type": "boolean"
        },
        "contentUriSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to content_uri."
        },
        "transparencySuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to transparency."
        },
        "angleSuggested": {
          "description": "Indicates if there was a suggested change to angle.",
          "type": "boolean"
        },
        "contrastSuggested": {
          "description": "Indicates if there was a suggested change to contrast.",
          "type": "boolean"
        }
      },
      "type": "object"
    },
    "CropPropertiesSuggestionState": {
      "description": "A mask that indicates which of the fields on the base CropProperties have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "properties": {
        "offsetBottomSuggested": {
          "description": "Indicates if there was a suggested change to offset_bottom.",
          "type": "boolean"
        },
        "offsetTopSuggested": {
          "description": "Indicates if there was a suggested change to offset_top.",
          "type": "boolean"
        },
        "offsetRightSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to offset_right."
        },
        "offsetLeftSuggested": {
          "description": "Indicates if there was a suggested change to offset_left.",
          "type": "boolean"
        },
        "angleSuggested": {
          "description": "Indicates if there was a suggested change to angle.",
          "type": "boolean"
        }
      },
      "id": "CropPropertiesSuggestionState",
      "type": "object"
    },
    "LinkedContentReferenceSuggestionState": {
      "description": "A mask that indicates which of the fields on the base LinkedContentReference have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "id": "LinkedContentReferenceSuggestionState",
      "type": "object",
      "properties": {
        "sheetsChartReferenceSuggestionState": {
          "description": "A mask that indicates which of the fields in sheets_chart_reference have been changed in this suggestion.",
          "$ref": "SheetsChartReferenceSuggestionState"
        }
      }
    },
    "SheetsChartReferenceSuggestionState": {
      "type": "object",
      "id": "SheetsChartReferenceSuggestionState",
      "description": "A mask that indicates which of the fields on the base SheetsChartReference have been changed in this suggestion. For any field set to true, there's a new suggested value.",
      "properties": {
        "spreadsheetIdSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to spreadsheet_id."
        },
        "chartIdSuggested": {
          "description": "Indicates if there was a suggested change to chart_id.",
          "type": "boolean"
        }
      }
    },
    "SuggestedDateElementProperties": {
      "properties": {
        "dateElementProperties": {
          "description": "DateElementProperties that only includes the changes made in this suggestion. This can be used along with the date_element_properties_suggestion_state to see which fields have changed and their new values.",
          "$ref": "DateElementProperties"
        },
        "dateElementPropertiesSuggestionState": {
          "description": "A mask that indicates which of the fields on the base DateElementProperties have been changed in this suggestion.",
          "$ref": "DateElementPropertiesSuggestionState"
        }
      },
      "id": "SuggestedDateElementProperties",
      "description": "A suggested change to a DateElementProperties.",
      "type": "object"
    },
    "DateElementPropertiesSuggestionState": {
      "id": "DateElementPropertiesSuggestionState",
      "properties": {
        "timestampSuggested": {
          "description": "Indicates if there was a suggested change to timestamp.",
          "type": "boolean"
        },
        "timeFormatSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to time_format."
        },
        "dateFormatSuggested": {
          "type": "boolean",
          "description": "Indicates if there was a suggested change to date_format."
        },
        "timeZoneIdSuggested": {
          "description": "Indicates if there was a suggested change to time_zone_id.",
          "type": "boolean"
        },
        "localeSuggested": {
          "description": "Indicates if there was a suggested change to locale.",
          "type": "boolean"
        }
      },
      "type": "object",
      "description": "A mask that indicates which of the fields on the base DateElementProperties have been changed in this suggestion. For any field set to true, there's a new suggested value."
    }
  }
};
