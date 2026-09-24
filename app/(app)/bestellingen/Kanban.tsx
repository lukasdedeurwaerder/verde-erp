"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bestellingNummer, datum, KANBAN_KOLOMMEN, STATUS_LABEL } from "@/lib/bestelling";
import { euro } from "@/lib/geld";
import type { BestellingSoort, BestellingStatus } from "@/lib/types";
import { statusWijzigen } from "./acties";

export type Kaart = {
  id: string;
  soort: BestellingSoort;
  jaar: number;
  nummer: number;
  relatie: string;
  verantwoordelijke: string | null;
  datum: string;
  leverdatum: string | null;
  totaal: number;
  status: BestellingStatus;
  bedrijf: { naam: string; kleur: string } | null;
};

// Het kanban-bord. Kaarten slepen naar een andere kolom wijzigt de
// status; wie niet kan slepen (touchscreen), gebruikt het keuzelijstje
// op de kaart.
export function Kanban({ kaarten: begin }: { kaarten: Kaart[] }) {
  const [kaarten, setKaarten] = useState(begin);
  const [sleep, setSleep] = useState<string | null>(null);
  const [doel, setDoel] = useState<BestellingStatus | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [, start] = useTransition();

  function verplaats(id: string, status: BestellingStatus) {
    const kaart = kaarten.find((k) => k.id === id);
    if (!kaart || kaart.status === status) return;
    const vorige = kaart.status;
    setKaarten((ks) => ks.map((k) => (k.id === id ? { ...k, status } : k)));
    start(async () => {
      const r = await statusWijzigen(id, status);
      if (r.fout) {
        setFout(r.fout);
        setKaarten((ks) => ks.map((k) => (k.id === id ? { ...k, status: vorige } : k)));
      }
    });
  }

  return (
    <>
      {fout && <p className="foutmelding">{fout}</p>}
      <div className="kanban">
        {KANBAN_KOLOMMEN.map((kolom) => {
          const lijst = kaarten.filter((k) => k.status === kolom);
          return (
            <div
              key={kolom}
              className={`kanban__kolom${doel === kolom ? " kanban__kolom--doel" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (doel !== kolom) setDoel(kolom);
              }}
              onDragLeave={() => setDoel(null)}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || sleep;
                if (id) verplaats(id, kolom);
                setSleep(null);
                setDoel(null);
              }}
            >
              <div className="kanban__kop">
                {STATUS_LABEL[kolom]} <span className="kanban__aantal">{lijst.length}</span>
              </div>
              {lijst.map((k) => (
                <div
                  key={k.id}
                  className={`kanban__kaart${sleep === k.id ? " kanban__kaart--sleept" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", k.id);
                    e.dataTransfer.effectAllowed = "move";
                    setSleep(k.id);
                  }}
                  onDragEnd={() => {
                    setSleep(null);
                    setDoel(null);
                  }}
                >
                  <div className="kanban__kaartkop">
                    <Link href={`/bestellingen/${k.id}`} className="rij">
                      {bestellingNummer(k)}
                    </Link>
                    <span className={`badge ${k.soort === "verkoop" ? "badge--goed" : ""}`}>
                      {k.soort === "verkoop" ? "verkoop" : "aankoop"}
                    </span>
                  </div>
                  <div className="kanban__relatie">{k.relatie}</div>
                  {k.bedrijf && (
                    <span className="badge badge--bedrijf" style={{ background: k.bedrijf.kleur }}>
                      {k.bedrijf.naam}
                    </span>
                  )}
                  <div className="kanban__meta">
                    <span>{euro(k.totaal)}</span>
                    <span>{k.leverdatum ? `lever ${datum(k.leverdatum)}` : datum(k.datum)}</span>
                  </div>
                  <div className="kanban__meta">
                    <span>{k.verantwoordelijke ?? "— geen verantwoordelijke —"}</span>
                  </div>
                  <select
                    className="kanban__status"
                    value={k.status}
                    onChange={(e) => verplaats(k.id, e.target.value as BestellingStatus)}
                    aria-label="Status wijzigen"
                  >
                    {KANBAN_KOLOMMEN.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {lijst.length === 0 && <div className="kanban__leeg">—</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
