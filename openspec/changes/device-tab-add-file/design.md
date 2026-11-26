# Design

## Context

The device tab opens `SendToGatewayComponent` twice: to send a repository entry, and with
`registerOnly` to register a name. The editor lives on its own route, `/ot-connectors/:id`, and
always returns to the OT connectors list. Upload and Duplicate hand the editor a prefilled file
through `PendingFileService`.

## Decisions

### One dialog with three choices

The send dialog, opened from the device tab, starts with *From the repository*, *New file* and
*Already on the gateway*. Opened from the OT connectors page (with an entry), it stays as it is.
Keeping one dialog keeps one button, and the choice that registers only is labelled where it is
made.

### The editor's context in the URL

The editor reads query parameters: `gateway=<id>` names the gateway tab it was opened from;
`file=<name>` (and, for a library, `protocol=<protocol>`) fixes the file it creates. URL parameters
survive a reload, unlike `PendingFileService`, and a later "return to where you came from" for
other callers can extend them. A plain helper parses and checks them, so a hand-edited URL can't
fix an invalid name or protocol.

### Send after saving

With `gateway` set, Save opens the existing send dialog for the saved entry and that gateway. The
dialog registers the file if the gateway doesn't offer its type, then sends it, as it does from the
tab. The user can still cancel there. When the dialog closes, the editor returns to the tab.

### The device type stays empty

An entry with a device type only shows for devices of that type
(`RepositoryService.getDeviceTypeQuery`). Prefilling the gateway's type would hide the new entry
from gateways of other types, so the editor keeps its default: empty, offered to every device type.

### Missing on the gateway

thin-edge.io fails a snapshot request for a registered path that doesn't exist with "Config file
not found: <path>", inside a longer reason. The tab reads the newest `c8y_UploadConfigFile` and
`c8y_DownloadConfigFile` operations of the selected type. When the newest one is a failed upload
whose reason contains "Config file not found", it shows the hint. ("Plugin not found", for an
unknown plugin, is a different failure.) It checks again when the type changes, on Reload, and when the
gateway's operations change (realtime). A successful send or snapshot afterwards clears it.

## Risks

- The failure text comes from thin-edge.io. The match is on "Config file not found",
  case-insensitive, as thin-edge.io 2.1 reports it (checked on a tenant).
- A new connector file from a template keeps the template's service name
  (thin-edge/tedge-dot#142). That is not changed here.
