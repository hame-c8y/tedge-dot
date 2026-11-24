# RFC 0007: Gateway values — one connector file for many gateways

Status: draft, for review. Nothing is implemented yet. It builds on the Cumulocity Device
Management plugin for connector files (thin-edge/tedge-dot#134, `doc/c8y-connector-files.md`).

## Problem

A connector file says two things about each device: what it is (its points, its libraries, its
reporting policy) and where it is (`protocol_address`). The first is the same on every gateway
that has the device. The second is not.

```toml
[[device]]
name             = "meter-1"
points_from      = ["acme-meter-v2"]                                                    # same everywhere
protocol_address = { transport = "tcp", host = "10.20.4.15", port = 502, unit_id = 1 }  # this site only
```

[RFC 0004](0004-point-libraries.md) moved the point list out of the connector file, so twenty
identical meters on one gateway share one library. The same problem is still there one level up:
twenty identical **gateways**, each with a meter at a different address, need twenty connector
files that differ in one line each. That makes:

* **sharing impossible.** The Cumulocity plugin keeps connector files in the configuration
  repository and sends one entry to a group of gateways as one bulk operation. A file that holds
  one site's addresses can only go to that site, so the repository needs an entry per gateway and
  the group send is of no use.
* **fixes unscalable.** A changed reporting policy or a new device is an edit in every copy, and
  nothing shows that the copies still agree outside their addresses.
* **switching a device off per site impossible.** Some sites have a second meter and some do not.
  `enabled = false` (contract §3.3) exists, but it is a property of the file, so a site that lacks
  the device needs its own copy.

## Decision

Split each connector file's per-gateway values into a small **gateway file** next to it. The
connector file is the same on every gateway; the gateway file holds this gateway's device
addresses and on/off flags. tedge-dot merges the two by device name when it loads the
configuration.

```toml
# /etc/tedge/plugins/ot/boiler-room.toml: the same on every gateway
[connector]
protocol     = "modbus"
service_name = "tedge-dot-boiler-room"

[[device]]
name             = "meter-1"
points_from      = ["acme-meter-v2"]
protocol_address = { transport = "tcp", host = "192.168.0.10", port = 502, unit_id = 1 }

[[device]]
name        = "meter-2"
points_from = ["acme-meter-v2"]
enabled     = false              # only some sites have a second meter
```

```toml
# /etc/tedge/plugins/ot/gateway.d/boiler-room.toml: on one gateway
[[device]]
name             = "meter-1"
protocol_address = { transport = "tcp", host = "10.20.4.15", port = 502, unit_id = 1 }

[[device]]
name             = "meter-2"
enabled          = true
protocol_address = { transport = "tcp", host = "10.20.4.16", port = 502, unit_id = 1 }
```

On this gateway the connector polls `meter-1` at 10.20.4.15 and `meter-2` at 10.20.4.16. A
gateway without a gateway file polls `meter-1` at 192.168.0.10 and leaves `meter-2` off.

The rules would become normative in a new contract §3.5, with a `gateway.schema.json` next to
`point-library.schema.json`. The decisions worth arguing about are below.

### 1. One gateway file per connector file, found by name

The gateway file of `<dir>/<name>.toml` is `<dir>/gateway.d/<name>.toml`. On a gateway that is
`/etc/tedge/plugins/ot/gateway.d/<name>.toml`. Elsewhere, in a source checkout or the demo, it
is found relative to the connector file's directory, as relative library paths are.

`run` reads every `*.toml` directly in its configuration directory and does not descend into
subdirectories, so the files in `gateway.d/`, like those in `points.d/`, are never mistaken for
connector files.

One file per connector file, rather than one per gateway, because a device name is unique only
within one connector (§3.3, §8): two connector files may each have a `plc-1`. A file per
connector keeps the merge key a plain device name and keeps the merge inside one load, as
library resolution is. It also matches how the Cumulocity plugin names and sends files: one configuration type per
connector file, and a gateway file sent together with the connector file it belongs to.

The connector file does not name its gateway file, and there is no setting to move it. The
connector file is the shared part, so it cannot say anything gateway-specific, and a fixed path
is something the Cumulocity plugin and a person logged in to the gateway can both rely on.

**Alternative rejected:** one gateway file per gateway, with a section per connector file
(`[connector."boiler-room"]`). It is one file to register and send, but every key needs the
connector file's name in front of it, a change to one connector's values rewrites a file all of
them read, and its configuration type `tedge-dot-gateway` would collide with a connector file
named `gateway.toml`.

### 2. A gateway file sets two keys per device

A gateway file holds only `[[device]]` entries, and each entry holds only:

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | The device in the connector file these values are for. |
| `protocol_address` | no | Replaces the connector file's `protocol_address` for this device. |
| `enabled` | no | Replaces the connector file's `enabled` for this device (§3.3). |

These are the values that differ from one gateway to the next. Everything else about a device
(its type, points, libraries, intervals, reporting and grouping) describes what the device is,
which is the same on every gateway and is why the connector file can be shared. A key the
connector file allows but a gateway file does not (`poll_interval`, say) is refused with a
message that says so and names the connector file as the place for it.

A gateway file never defines a device. It holds values for devices the connector file defines,
so the connector file stays the one place that says which devices and points exist, and the
gateway file cannot grow into a second connector file.

A connector file meant to be shared across sites should leave its devices switched off
(`enabled = false`, which needs no `protocol_address`, §3.3) and let each gateway switch on the
ones it has. A device with a default address is polled at that address by every gateway that
does not set its own, and on another site's network that address may be a different device.

**Alternative rejected:** placeholders in the connector file (`host = "${METER_1_HOST}"`) filled
from the gateway's environment or a values file. A file with placeholders is not a valid
configuration until it is filled in (a port written as `"${PORT}"` is a string), so the schema,
the Cumulocity editor and `tedge-dot check` cannot validate it, and every key becomes a
possible placeholder with its own escaping and missing-value rules. Merging by device name reuses
rules the loader already has.

### 3. Merge order: the gateway file is the most specific source

The override rules are the ones point libraries have (§3.4): a later definition of the same
point patches the one collected so far, and a field it declares replaces the inherited one, except
for the tables that merge key by key (`meta`, `transform`, `report`, `grouping`). A gateway file
applies the same rule one level up, to the device of the same name. A device's values come from
three sources, least specific first:

| Precedence | Source | Sets |
| --- | --- | --- |
| 1 | point libraries, in `points_from` order | points |
| 2 | the connector file's `[[device]]` entry and its inline points | device settings and points |
| 3 | the gateway file's `[[device]]` entry of the same name | `protocol_address`, `enabled` |

The gateway file is applied to the device entry **before anything else is read from it**:
before the `enabled` rule of §3.3, the device's type, and its library references. So a gateway file can
switch on a device the connector file ships switched off, and the rest of the load (libraries,
inline points, validation) sees one merged device, exactly as if it had been written that way.

`protocol_address` is **replaced** whole, never merged. That is the rule for a point's
`address`, for the same reason: a partly inherited protocol address is an address nobody wrote.
A gateway that switches a Modbus device from `rtu` to `tcp` would otherwise inherit the shared
file's `serial_port`. It also keeps settings from leaking across the boundary: a gateway's OPC
UA address does not inherit `trust_any_server_certificate = true` or a `password_file` from the
shared file without saying so. The cost is that a gateway restates the keys it does not change
(`port`, `unit_id`, an OPC UA `security_policy`). The Cumulocity form starts from the connector
file's address, so restating is not retyping. See open question 3.

tedge-dot never writes the gateway file. The management verbs (§6.3) keep patching and persisting
the connector file only (decision 6).

### 4. Validation, and a device the connector file does not have

A gateway file is validated where it is read, with the same rules and message style as a
connector file:

* TOML syntax, then the known keys: top level `device` only; in a device `name`,
  `protocol_address` and `enabled`; each refused key named with the closest known key (§3.3).
* `name` a non-empty string, unique within the gateway file. A repeated name is an error, as a
  repeated point `id` within one library is: there is no order in which to apply it.
* `enabled` a boolean, `protocol_address` a table.
* A file that carries `connector`, `mqtt`, `connection` or `point` at the top level, or a
  `[library]` table, is refused as a connector configuration or a point library put in the wrong
  folder.

The merged device is then validated like any other (§3.3, §3.4 and the connector's own schema
for `protocol_address`). An error names the file the value came from:
`gateway file '/etc/tedge/plugins/ot/gateway.d/boiler-room.toml': device 'meter-2':
protocol_address: ...`. A device the gateway file switches on, with an address in neither file,
is reported as missing its `protocol_address`, naming both files.

A gateway file that **names a device the connector file does not define** is a **warning**, not
an error. The entry is ignored, and the warning names the device and the gateway file in the log
and on stderr from `tedge-dot describe`. Connector and gateway files arrive in separate operations
and are changed by different people: removing `meter-2` from the shared file must not stop the
connector on every gateway that still has values for it, and a gateway file updated a moment
before the connector file that adds a device must not either. [RFC 0005](0005-device-types-and-parameter-sets.md)
made the same choice for a device without a type. See open question 4.

A **missing** gateway file is not a warning: the connector file is used as it is. A gateway file
that **cannot be read or parsed** is an error, and the load fails as for a broken library: falling
back to the connector file alone would poll the shared default addresses, which is the wrong
device on most sites.

A gateway file with no connector file of the same name is not read. `run` logs a warning naming
it once at startup, since it usually means a renamed or removed connector file.

**Alternative rejected:** letting the gateway file add devices. It would give the gateway two
files that define devices, and the one that is not shared would gradually become a fork of the
one that is.

### 5. The config watch reloads on a gateway file change

The watch (§3, *Reloading*) adds each connector file's gateway file path to the files it polls,
whether or not the file exists, as it does for a library reference that does not resolve yet, so
creating, changing and removing a gateway file are all changes. The reload is the one that exists:
the connector file is resolved again, now with its gateway file, and compared with the running
configuration. A gateway file that resolves to what is running changes nothing; any other change
is applied in place without a restart, as an edited connector file is.

Removing a gateway file reverts its devices to the connector file's values, which for a shared
file following decision 2 means switching them off.

Two files that change together (a new device in the connector file and its address in the gateway
file) may be applied in two reloads, because they arrive in two operations. Sending the gateway
file first means the device is never switched on with only the shared values in between, which is
the order the Cumulocity plugin uses (decision 8).

### 6. Management verbs do not change values a gateway file sets

The runtime patches and persists the connector file's document (§6.3). A `set-config` or
`define-device` that changes the `protocol_address` or `enabled` of a device whose gateway file
sets that key would be written to the connector file and then overridden by the gateway file on
the next load: a command that reports `successful` and changes nothing.

Such a command is therefore refused (`failed`, with a reason naming the device, the key and the
gateway file). As for path references (§3.4), only what the command changes is judged: a
`set-config` of the device's `poll_interval`, or a `define-device` that restates the address the
connector file already has, is accepted. The candidate configuration is validated with the gateway
file applied, so a command cannot persist a connector file that fails together with it.

**Alternative rejected:** writing those keys to the gateway file instead. The gateway file's
source of truth is outside the gateway (decision 8), so a value written there locally would be
lost on the next send, the same way a management command's change to a shared connector file is.
See open question 5.

### 7. thin-edge.io offers the gateway file as its own configuration type

With thin-edge.io's file plugin (what the Cumulocity plugin uses today), the gateway file is one
more entry in `tedge-configuration-plugin.toml`:

| File | Configuration type |
| --- | --- |
| `/etc/tedge/plugins/ot/<name>.toml` | `tedge-dot-<name>` |
| `/etc/tedge/plugins/ot/points.d/<protocol>/<name>.toml` | `tedge-dot-points.<protocol>.<name>` |
| `/etc/tedge/plugins/ot/gateway.d/<name>.toml` | `tedge-dot-gateway.<name>` |

```toml
[[files]]
path = '/etc/tedge/plugins/ot/gateway.d/<name>.toml'
type = 'tedge-dot-gateway.<name>'
user = 'tedge'
group = 'tedge'
mode = 0o644
parent_user = 'tedge'
parent_group = 'tedge'
parent_mode = 0o755
```

The `parent_*` keys let the file plugin create `gateway.d/` when the first gateway file arrives,
as they do for a library's protocol folder. The Cumulocity plugin already refuses connector file
names that start with `points.`; it would refuse `gateway.` too, so the three kinds never share a
type.

The file plugin writes whatever it receives, so as with connector files, tedge-dot validates the
gateway file when it loads it, and a refused file still counts as installed in Cumulocity. The
gateway configuration plugin planned in hame-c8y/tedge-dot#7 closes that gap for connector
files by checking a file with tedge-dot's own code before it is installed. It would list gateway
files as their own type next to connector files, and `tedge-dot check` would accept a gateway file
and check it together with the connector file of the same name, with the rules above.

### 8. Cumulocity keeps gateway values on the gateway's managed object

The repository holds what is shared, so per-gateway values do not go there. They are kept on the
gateway's own managed object, in one fragment:

```json
"tedgeDot_GatewayValues": {
  "files": [
    {
      "name": "boiler-room",
      "changed": "2026-11-24T10:15:00.000Z",
      "devices": [
        { "name": "meter-1",
          "protocol_address": { "transport": "tcp", "host": "10.20.4.15", "port": 502, "unit_id": 1 } },
        { "name": "meter-2", "enabled": true,
          "protocol_address": { "transport": "tcp", "host": "10.20.4.16", "port": 502, "unit_id": 1 } }
      ]
    }
  ]
}
```

`changed` is the time of the last save. The fragment uses lists rather than objects keyed by
name, so a connector file or device name never becomes a property name, where a `.` would read as
a path in an inventory query. The values go with the
gateway: deleting the gateway deletes them, and the platform's inventory permissions on the
device apply to them.

The plugin renders the gateway file from the fragment, with a comment saying that it was written
from Cumulocity and that local edits are replaced by the next send. The values are sent:

* **when they are saved**, as a configuration operation of type `tedge-dot-gateway.<name>` with a
  temporary upload, registering the type first if the gateway does not offer it yet (the same
  confirmation step as adding a connector file);
* **before the connector file**, when a connector file is sent to one gateway that has values for
  it, as libraries are sent before the connector file that references them.

In the UI:

* **Device tab.** The OT connectors tab gets a **Gateway values** section for each connector file
  the gateway has: one row per device of the file, with an on/off switch, the protocol's address
  fields filled in from the connector file, and *Default* when the gateway sets nothing. *Reset to
  default* removes the device's values.
* **Central editor.** On the OT connectors page, a device's address in a connector file shows
  *Default* and how many of the gateways using the file set their own ("2 of 3 gateways set their
  own").
* **Group sends.** A bulk operation sends one file to every gateway, so it sends the shared
  connector file only. Before it is created, the dialog lists the gateways in the group without
  values for the file, which will use the connector file's addresses or keep its devices off, and
  the gateways whose values name devices the file no longer defines.

A managed object can be read by anyone with read access to the device, so the Gateway values
section never stores a secret. Keys that hold one (an OPC UA `password`) are not offered; an
address uses `password_file` instead, and setting the file itself is hame-c8y/tedge-dot#6.

**Alternative rejected:** merging in the cloud and sending each gateway its own complete connector
file. It needs no gateway change, but no two gateways would then run the same file: a group send
becomes one operation per gateway, the repository entry is no longer what any gateway runs, and
comparing an entry with a gateway's snapshot (hame-c8y/tedge-dot#4) shows a difference on every
gateway.

**Alternative rejected:** setting per-gateway addresses with `set-config` from Cumulocity. The
command persists into the connector file on the gateway, which then differs from the shared file,
and the next send of the shared file removes the change.

## What this does not do

* **Per-gateway point values.** A gateway cannot switch off one point or change one point's
  address. A `[[device.point]]` in the gateway file with only `id` and `enabled` would fit the
  resolver as it stands (it is a patch, applied after the connector file's inline points); it is
  left out until a site needs it. See open question 2.
* **`[connection]` values.** Shared protocol defaults that may differ per gateway (an OPC UA
  `application_uri` that has to match the gateway's own certificate, a Modbus RTU serial default)
  stay in the connector file.
* **Secrets.** Passwords, user certificates and trusted server certificates are
  hame-c8y/tedge-dot#6.
* **Discovery.** `define-device` still persists into the connector file. A discovery mechanism
  that wants per-gateway values could write the gateway file instead; that is not designed here.
* **Revisions of gateway values.** Which gateway runs which revision of a connector file is
  hame-c8y/tedge-dot#4.

## Implementation (planned)

| Where | What |
| --- | --- |
| contract §3, §3.3, new §3.5, §6.3 | the gateway file, its keys and merge order; *Reloading* names gateway files; the management-verb refusal |
| `doc/contract/schemas/gateway.schema.json` | the gateway file |
| `impl/rust/crates/sdk/src/library.rs` | `load` reads the gateway file and applies it to the document between the key check and `expand`; `referenced_library_files` (or a new list of watched files) includes the gateway path; the management guard next to `reject_path_references` |
| `impl/c/sdk/src/config.c` | `tdot_config_load` parses the gateway file and keeps its document, as it keeps library documents, since `protocol_address` is borrowed from it; `tdot_config_fingerprint` includes it, so a reload sees the change; `tdot_config_referenced_libraries` includes the gateway path |
| `impl/c/sdk/src/runtime.c`, `impl/rust/crates/sdk/src/runtime.rs` | candidates validated with the gateway file; the refusal of decision 6 |
| Tests | mirrored loader tests in both SDKs (merge, `enabled` both ways, unknown device warning, repeated name, refused keys, broken and missing file), a watch test per build, and an e2e run with a shared connector file and two gateway files |
| `ui/` | the fragment, the Gateway values section, sending gateway files, the group-send warnings, the central editor counts, the reserved `gateway.` prefix |
| Docs | `doc/c8y-connector-files.md`, the docs site's configuration pages |

## Breaking changes

None in tedge-dot: without a `gateway.d/` folder every configuration loads as before.

The Cumulocity plugin reserves connector file names starting with `gateway.`. A file named that
way still works on its gateway but cannot be added through the plugin.

## Open questions

1. **One file per connector file, or one per gateway?** This draft proposes one per connector
   file (decision 1). The Cumulocity mock-ups so far show one per gateway.
2. **Which keys?** `protocol_address` and `enabled` only, or also point-level `enabled`, a
   device's `max_inflight` (an endpoint's capacity can differ per site), or `[connection]` keys?
3. **Replace or merge `protocol_address`?** Replacing (decision 3) is the library rule and stops
   settings leaking across. Merging key by key would let a gateway set only `host` or `endpoint`,
   and would let an OPC UA gateway keep the shared file's `namespaces` and security settings.
4. **A device the connector file does not define: warning or error?** A warning (decision 4)
   survives devices being added and removed across a fleet; an error catches a misspelt name.
5. **Management verbs: refuse or redirect?** Decision 6 refuses a command that changes a value the
   gateway file sets. Should such a command write the gateway file instead, for gateways managed
   without Cumulocity?
6. **Local-only settings from Cumulocity.** Under hame-c8y/tedge-dot#7, a file from Cumulocity
   may not add, change or remove local-only settings (§3.4), and with decision 3 every address a
   gateway file sets restates them (an OPC UA `password_file`, `trust_any_server_certificate`). Should the plugin read
   the gateway's current file and keep those keys as they are, or should they move to a file that
   only the gateway writes (hame-c8y/tedge-dot#6)?
7. **Should the connector report which gateway file it applied?** A digest on the capability
   descriptor or the health message would let Cumulocity tell a sent file from an applied one.
8. **Group sends.** Should a group send also send each gateway's own gateway file, as one
   operation per gateway, or is the warning enough?
9. **Fragment name.** `tedgeDot_GatewayValues` follows the `<vendor>_<Name>` convention; is there
   a name thin-edge.io already uses for its own fragments?
