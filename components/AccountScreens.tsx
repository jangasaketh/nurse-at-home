"use client";

// Family members, addresses and the emergency contact: add, edit, remove.

import { useState, type FormEvent } from "react";
import { useApp } from "@/lib/store";
import { ADDRESS_LABELS, CITIES, RELATIONS } from "@/lib/data";
import { SELF, cityById, formatAddress, newId, type Address, type Patient } from "@/lib/booking";
import { Icon } from "./Icon";
import { BottomBar, Chip, EmptyState, Header, TextField } from "./ui";

const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

/** Two-step remove, so nothing is deleted by one accidental tap. */
function RemoveButton({ what, onRemove }: { what: string; onRemove: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" className="btn btn-danger" onClick={() => setAsking(true)}>Remove {what}</button>;
  }
  return (
    <div className="danger-box stack">
      <div className="strong">Remove {what}?</div>
      <div className="actions">
        <button type="button" className="btn btn-danger-solid" style={{ minHeight: 48, fontSize: 16 }} onClick={onRemove}>Yes, remove</button>
        <button type="button" className="btn btn-outline" onClick={() => setAsking(false)}>Keep</button>
      </div>
    </div>
  );
}

/* Add or edit a family member */
export function FamilyFormScreen() {
  const { state, back } = useApp();
  const existing = state.patients.find((p) => p.id === state.editingId) ?? null;
  const isSelf = existing?.relation === SELF;

  const [name, setName] = useState(existing?.name ?? "");
  const [relation, setRelation] = useState(isSelf ? "" : existing?.relation ?? "");
  const [age, setAge] = useState(existing?.age ? String(existing.age) : "");
  const [gender, setGender] = useState<Patient["gender"]>(existing?.gender ?? "");
  const [tried, setTried] = useState(false);

  const ageNumber = Number(age);
  const errors = {
    name: name.trim().length < 2 ? "Enter the person's name." : undefined,
    relation: !isSelf && !relation ? "Choose how they are related to you." : undefined,
    // Age is needed for family members (the nurse must know who to expect). It is optional for yourself.
    age: (!isSelf && !age) || (age && (ageNumber < 0 || ageNumber > 120)) ? "Enter an age between 0 and 120." : undefined,
  };
  const hasBooking = existing !== null && state.booking?.patient.id === existing.id;

  const save = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (errors.name || errors.relation || errors.age) return;
    const patient: Patient = {
      id: existing?.id ?? newId("p"),
      name: name.trim(),
      relation: isSelf ? SELF : relation,
      age: age ? ageNumber : null,
      gender,
    };
    // TODO: save through the API.
    back({
      patients: existing ? state.patients.map((p) => (p.id === patient.id ? patient : p)) : [...state.patients, patient],
      // A newly added person becomes the one being booked for.
      patientId: existing ? state.patientId : patient.id,
    });
  };

  const remove = () => {
    if (!existing) return;
    back({
      patients: state.patients.filter((p) => p.id !== existing.id),
      patientId: state.patientId === existing.id ? "me" : state.patientId,
    });
  };

  return (
    <form className="screen" onSubmit={save} noValidate>
      <Header title={existing ? (isSelf ? "Your details" : "Edit family member") : "Add a family member"} onBack={() => back()} />
      <div className="scroll gap-lg">
        <TextField id="member-name" label="Full name" value={name} onChange={setName} error={tried ? errors.name : undefined} autoComplete="off" />

        {!isSelf && (
          <div className="stack">
            <label id="relation-label">How are they related to you?</label>
            <div className="wrap" role="group" aria-labelledby="relation-label">
              {RELATIONS.map((r) => (
                <Chip key={r} className="chip-toggle" selected={relation === r} onClick={() => setRelation(r)}>{r}</Chip>
              ))}
            </div>
            {tried && errors.relation && <div role="alert" className="error">{errors.relation}</div>}
          </div>
        )}

        <TextField
          id="member-age"
          label={isSelf ? "Age (optional)" : "Age"}
          value={age}
          onChange={(v) => setAge(digits(v, 3))}
          error={tried ? errors.age : undefined}
          inputMode="numeric"
          hint="Helps the nurse prepare, for example for a child or an older person."
        />

        <div className="stack">
          <label id="gender-label">Gender (optional)</label>
          <div className="wrap" role="group" aria-labelledby="gender-label">
            <Chip className="chip-toggle" selected={gender === "F"} onClick={() => setGender(gender === "F" ? "" : "F")}>Female</Chip>
            <Chip className="chip-toggle" selected={gender === "M"} onClick={() => setGender(gender === "M" ? "" : "M")}>Male</Chip>
          </div>
        </div>

        {existing && !isSelf && (
          hasBooking
            ? <p className="small muted">{existing.name} has an upcoming visit, so this profile cannot be removed until it is over or cancelled.</p>
            : <RemoveButton what={existing.name} onRemove={remove} />
        )}
      </div>
      <BottomBar>
        <button type="submit" className="btn btn-primary">{existing ? "Save changes" : "Add family member"}</button>
      </BottomBar>
    </form>
  );
}

/* Saved addresses: choose where the nurse should come, or manage the list */
export function AddressesScreen() {
  const { state, set, open, back } = useApp();
  const selectedId = state.addresses.some((a) => a.id === state.addressId) ? state.addressId : state.addresses[0]?.id;

  return (
    <div className="screen">
      <Header title="Your addresses" onBack={() => back()} />
      <div className="scroll">
        <h1>Where should the nurse come?</h1>
        {state.addresses.length === 0 && (
          <EmptyState
            icon="pin"
            title="No address saved yet"
            body="Add the address for home visits. You can save more than one, for example your parents' home."
          />
        )}
        {state.addresses.map((a) => (
          <div key={a.id} className="row-inline" style={{ gap: 8, alignItems: "stretch" }}>
            <button
              type="button"
              className="radio-card"
              style={{ flex: 1, minWidth: 0 }}
              aria-pressed={a.id === selectedId}
              // The city can change with the address, so the language preference is cleared.
              onClick={() => set({ addressId: a.id, language: null })}
            >
              <span className="radio-dot" />
              <span className="stack-xs" style={{ minWidth: 0 }}>
                <span className="strong">{a.label}</span>
                <span className="small muted">{formatAddress(a)}</span>
              </span>
            </button>
            <button type="button" className="icon-btn" style={{ height: "auto", border: "1px solid var(--line)", background: "var(--surface)" }} aria-label={`Edit ${a.label} address`} onClick={() => open("address", { editingId: a.id })}>
              <Icon name="edit" size={20} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-outline" onClick={() => open("address", { editingId: null })}>
          <Icon name="plus" size={20} />
          Add a new address
        </button>
      </div>
      {state.addresses.length > 0 && (
        <BottomBar>
          <button type="button" className="btn btn-primary" onClick={() => back()}>Use this address</button>
        </BottomBar>
      )}
    </div>
  );
}

/* Add or edit one address */
export function AddressFormScreen() {
  const { state, back } = useApp();
  const existing = state.addresses.find((a) => a.id === state.editingId) ?? null;
  const firstEver = !existing && state.addresses.length === 0;

  const [label, setLabel] = useState(existing?.label ?? (firstEver ? "Home" : ""));
  const [line, setLine] = useState(existing?.line ?? "");
  const [area, setArea] = useState(existing?.area ?? "");
  const [cityId, setCityId] = useState(existing?.cityId ?? state.addresses[0]?.cityId ?? CITIES[0].id);
  const [pincode, setPincode] = useState(existing?.pincode ?? "");
  const [landmark, setLandmark] = useState(existing?.landmark ?? "");
  const [tried, setTried] = useState(false);

  const errors = {
    label: !label ? "Choose a name for this address." : undefined,
    line: line.trim().length < 3 ? "Enter the flat or house number, building and street." : undefined,
    area: area.trim().length < 2 ? "Enter the area or locality." : undefined,
    pincode: pincode.length !== 6 ? "Enter the 6-digit PIN code." : undefined,
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (errors.label || errors.line || errors.area || errors.pincode) return;
    const address: Address = {
      id: existing?.id ?? newId("a"),
      label,
      line: line.trim(),
      area: area.trim(),
      cityId,
      pincode,
      landmark: landmark.trim(),
    };
    // TODO: save through the API, and check that we serve this PIN code.
    back({
      addresses: existing ? state.addresses.map((a) => (a.id === address.id ? address : a)) : [...state.addresses, address],
      addressId: address.id,
      language: null,
    });
  };

  const remove = () => {
    if (!existing) return;
    const rest = state.addresses.filter((a) => a.id !== existing.id);
    back({ addresses: rest, addressId: state.addressId === existing.id ? rest[0]?.id ?? null : state.addressId });
  };

  return (
    <form className="screen" onSubmit={save} noValidate>
      <Header title={existing ? "Edit address" : "Add an address"} onBack={() => back()} />
      <div className="scroll gap-lg">
        {firstEver && (
          <div className="stack" style={{ gap: 6 }}>
            <h1>Where should the nurse come?</h1>
            <p className="muted">We show the nurses who are near this address.</p>
          </div>
        )}

        <div className="stack">
          <label id="city-label">City</label>
          <div className="wrap" role="group" aria-labelledby="city-label">
            {CITIES.map((c) => (
              <Chip key={c.id} className="chip-toggle" selected={cityId === c.id} onClick={() => setCityId(c.id)}>{c.name}</Chip>
            ))}
          </div>
        </div>

        <TextField id="address-line" label="Flat or house number, building, street" value={line} onChange={setLine} error={tried ? errors.line : undefined} autoComplete="address-line1" />
        <TextField id="address-area" label="Area or locality" value={area} onChange={setArea} error={tried ? errors.area : undefined} placeholder={`For example, ${cityById(cityId).area}`} autoComplete="address-level2" />
        <TextField id="address-pin" label="PIN code" value={pincode} onChange={(v) => setPincode(digits(v, 6))} error={tried ? errors.pincode : undefined} inputMode="numeric" autoComplete="postal-code" />
        <TextField id="address-landmark" label="Landmark (optional)" value={landmark} onChange={setLandmark} hint="Something that helps the nurse find the door." autoComplete="off" />

        <div className="stack">
          <label id="label-label">Save this address as</label>
          <div className="wrap" role="group" aria-labelledby="label-label">
            {ADDRESS_LABELS.map((l) => (
              <Chip key={l} className="chip-toggle" selected={label === l} onClick={() => setLabel(l)}>{l}</Chip>
            ))}
          </div>
          {tried && errors.label && <div role="alert" className="error">{errors.label}</div>}
        </div>

        {existing && <RemoveButton what="this address" onRemove={remove} />}
      </div>
      <BottomBar>
        <button type="submit" className="btn btn-primary">{existing ? "Save changes" : "Save address"}</button>
        {firstEver && (
          <button type="button" className="btn btn-plain" onClick={() => back()}>Skip for now</button>
        )}
      </BottomBar>
    </form>
  );
}

/* The family member who is told about visits, and alerted on SOS */
export function ContactFormScreen() {
  const { state, back } = useApp();
  const existing = state.contact;
  const [name, setName] = useState(existing?.name ?? "");
  const [relation, setRelation] = useState(existing?.relation ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [tried, setTried] = useState(false);

  const errors = {
    name: name.trim().length < 2 ? "Enter their name." : undefined,
    relation: !relation ? "Choose how they are related to you." : undefined,
    phone: phone.length !== 10 ? "Enter a 10-digit mobile number." : undefined,
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (errors.name || errors.relation || errors.phone) return;
    back({ contact: { name: name.trim(), relation, phone } });
  };

  return (
    <form className="screen" onSubmit={save} noValidate>
      <Header title="Emergency contact" onBack={() => back()} />
      <div className="scroll gap-lg">
        <p className="muted">
          This person is alerted if you press SOS during a visit. You can also choose to send them updates when a nurse arrives and leaves.
        </p>
        <TextField id="contact-name" label="Full name" value={name} onChange={setName} error={tried ? errors.name : undefined} autoComplete="off" />
        <div className="stack">
          <label id="contact-relation-label">How are they related to you?</label>
          <div className="wrap" role="group" aria-labelledby="contact-relation-label">
            {RELATIONS.map((r) => (
              <Chip key={r} className="chip-toggle" selected={relation === r} onClick={() => setRelation(r)}>{r}</Chip>
            ))}
          </div>
          {tried && errors.relation && <div role="alert" className="error">{errors.relation}</div>}
        </div>
        <TextField id="contact-phone" label="Mobile number" value={phone} onChange={(v) => setPhone(digits(v, 10))} error={tried ? errors.phone : undefined} inputMode="numeric" type="tel" autoComplete="off" />
        {existing && <RemoveButton what="this contact" onRemove={() => back({ contact: null, notifyFamily: false })} />}
      </div>
      <BottomBar>
        <button type="submit" className="btn btn-primary">{existing ? "Save changes" : "Save contact"}</button>
      </BottomBar>
    </form>
  );
}
