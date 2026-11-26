## MODIFIED Requirements

### Requirement: OT connectors device tab
Devices whose `c8y_SupportedConfigurations` contains `tedge-configuration-plugin` SHALL get an "OT
connectors" tab. Other devices SHALL not get it. The tab SHALL list the device's `tedge-dot-` types,
connector files and point libraries, with Device Management's configuration components. For the selected file, it SHALL request a
snapshot, show the latest snapshot with its time, save it to the repository, download it, and send
it from a repository entry. The tab SHALL open an entry on the OT connectors page from the preview.

The tab SHALL offer one "Add connector file" action, which starts with a choice:
- *From the repository* SHALL send an entry the device does not offer, as "Send to a gateway or a
  group" describes.
- *New file* SHALL open the editor for a new connector file or point library for this device (see
  "Creating a file for a gateway"). It SHALL be hidden from users who can't add repository entries.
- *Already on the gateway* SHALL register a connector file `<name>` or a point library
  `<protocol>.<name>`, show the path it registers, and state that registering neither creates nor
  sends the file. It SHALL send nothing else.

When the selected type has no repository entry, the tab SHALL offer "Create connector file", or
"Create point library" for a library type, to users who can add repository entries.

#### Scenario: Device without thin-edge.io
- **WHEN** a device's supported configurations do not contain `tedge-configuration-plugin`
- **THEN** the device has no "OT connectors" tab

#### Scenario: Gateway without connector files
- **WHEN** a thin-edge.io gateway offers no `tedge-dot-` type
- **THEN** the tab shows an empty list and "Add connector file"

#### Scenario: Snapshot to repository
- **WHEN** a user requests a snapshot of `tedge-dot-opcua-pump` and saves it to the repository
- **THEN** a new entry of type `tedge-dot-opcua-pump` holds the snapshot's content

#### Scenario: Register a point library already on the gateway
- **WHEN** a user chooses *Already on the gateway*, *Point library*, the protocol `opcua` and the name `opcua-demo-pump`
- **THEN** the dialog shows `points.d/opcua/opcua-demo-pump.toml`, and after registering the gateway offers `tedge-dot-points.opcua.opcua-demo-pump`

#### Scenario: Create for a registered type without an entry
- **WHEN** a user selects `tedge-dot-opcua2`, which has no repository entry, and chooses "Create connector file"
- **THEN** the editor opens a new connector file with the file name `opcua2`, which can't be changed

## ADDED Requirements

### Requirement: Creating a file for a gateway
When the editor is opened from a gateway's OT connectors tab, it SHALL know that gateway. Save SHALL
then open the send dialog for the saved entry and that gateway, which registers the file if needed
and sends it, and the editor SHALL return to the tab when the dialog closes. Cancel SHALL return to
the tab. When the tab names a type, the editor SHALL fix the file name, and for a library its
protocol, to that type's. The editor SHALL ignore a gateway id, file name or protocol that is not
valid. It SHALL not prefill the device type.

#### Scenario: New file from the tab
- **WHEN** a user chooses *New file* on the tab of `gw-1`, saves the connector file `line-4`, and sends it in the dialog that opens
- **THEN** the repository holds an entry of type `tedge-dot-line-4`, `gw-1` gets a `c8y_DownloadConfigFile` operation for it, and the user is back on the tab of `gw-1`

#### Scenario: Cancel from the tab
- **WHEN** a user opens the editor from the tab of `gw-1` and chooses Cancel
- **THEN** the user is back on the tab of `gw-1` and nothing is saved

### Requirement: Registered file missing on the gateway
When the newest `c8y_UploadConfigFile` or `c8y_DownloadConfigFile` operation of the selected type
is a failed snapshot request whose failure reason contains "Config file not found", the tab SHALL say
that the file is registered but missing on the gateway, with its path, and SHALL offer to create it
(when the type has no repository entry and the user can add entries) or to send an entry.

#### Scenario: Snapshot of a missing file
- **WHEN** the snapshot request for `tedge-dot-opcua2` failed with `Config file not found: /etc/tedge/plugins/ot/opcua2.toml`
- **THEN** the tab says that `/etc/tedge/plugins/ot/opcua2.toml` is registered but missing on the gateway

#### Scenario: File sent afterwards
- **WHEN** an entry of type `tedge-dot-opcua2` was sent successfully after that failed request
- **THEN** the tab shows no hint
