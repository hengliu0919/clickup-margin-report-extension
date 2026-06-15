# ClickUp Custom Fields Backend Research

Status: research only. The product should keep browser-local settings for now.

## Why We Paused ClickUp-Backed Settings

Normal ClickUp custom fields are visible to workspace members who can access the List/task. In the test workspace, the normal probe field was readable by:

- admin
- Marco
- Alice

That makes normal custom fields unsafe for sensitive employee cost rates.

ClickUp supports private custom fields in the UI/API shape, but private custom field permissions are paid-plan gated. Creating a private field in the current workspace failed with:

```json
{
  "err": "Please upgrade plan to use this feature",
  "ECODE": "FIELD_073"
}
```

ClickUp documentation says Custom Field permissions are available on Business Plus and Enterprise plans. Their private permission model means only explicitly permitted people can see private custom fields.

## Internal Field Creation Flow Observed

Creating a normal Money custom field from the List view used:

```http
POST https://frontdoor-prod-us-east-2-2.clickup.com/customFields/v2/field?ignore_existing=true
```

Payload:

```json
{
  "name": "CMR API Probe - delete me",
  "description": "",
  "default_value": null,
  "pinned": false,
  "hide_from_guests": false,
  "type": "currency",
  "private": false,
  "permission_level": null,
  "members": [],
  "groups": [],
  "required": false,
  "required_on_subtasks": false,
  "currency": "USD",
  "numberFormat": "en-US",
  "type_config": {
    "currency_type": "USD",
    "precision": 2,
    "number_format": "en-US"
  },
  "subcategory_id": "901417274337"
}
```

Response included:

```json
{
  "id": "fb560ecf-f016-4786-b7b8-2fcb8730e15a",
  "name": "CMR API Probe - delete me",
  "type": "currency",
  "private": false,
  "team_id": "90141340871"
}
```

ClickUp then attached the field to the List location:

```http
PUT https://frontdoor-prod-us-east-2-2.clickup.com/field/v3/experience/workspaces/90141340871/fields/{field_id}/locations
```

Payload:

```json
{
  "new_locations": [
    {
      "parent": {
        "type": 6,
        "id": "901417274337"
      },
      "required": false,
      "required_on_subtasks": false,
      "hide_from_guests": false
    }
  ]
}
```

ClickUp then refetched:

```http
GET /customFields/v2/field/{field_id}
POST /field/v3/experience/workspaces/{workspace_id}/fields/bulk
```

## Private Field Attempt

Creating a private Money field sent:

```json
{
  "name": "Cost Rate",
  "type": "currency",
  "private": true,
  "hide_from_guests": true,
  "permission_level": null,
  "members": [],
  "groups": [],
  "subcategory_id": "901417274337"
}
```

The workspace returned `400 FIELD_073`, requiring a plan upgrade.

## Product Decision

Use browser-local storage as the backend for now:

- person cost rate
- person default bill rate
- project bill rate
- budget hours
- target margin
- client/project mapping

Support import/export JSON backups so users can move their settings between browser profiles.

Future ClickUp-backed storage can be revisited only if:

- the workspace is Business Plus or Enterprise,
- private custom fields can be created,
- non-permitted users cannot read private fields via UI or API,
- the app can clearly explain the privacy boundary.

## Safe Split If Revisited

Potentially okay in normal ClickUp fields:

- client
- project
- budget hours
- billing type

Sensitive, requiring private backend:

- employee/person cost rate
- default person bill rate
- project or person margin
- profit
