import { FormEvent, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { createRoot } from "react-dom/client";
import { getSupabase } from "./lib/supabase";
import "./styles.css";
import "./round.css";

type IconName =
  | "arrow"
  | "check"
  | "clock"
  | "download"
  | "file"
  | "lock"
  | "mail"
  | "refresh"
  | "shield"
  | "trash"
  | "upload"
  | "users";
const ICON_PATHS: Record<IconName, ReactNode> = {
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m14 7 5 5-5 5" />
    </>
  ),
  check: <path d="m5 12 4 4L19 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v11" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ),
  file: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h4" />
      <path d="M10 13h5M10 17h5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 1 0-2 5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14" />
    </>
  ),
  upload: (
    <>
      <path d="M12 21V10" />
      <path d="m8 14 4-4 4 4" />
      <path d="M5 5h14" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M3 20c.4-4 2.5-6 6-6s5.6 2 6 6M15 14c3.4 0 5.4 1.7 6 5" />
    </>
  ),
};
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
function FrogMark() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M7 27c3-7 7-10 13-10s10 3 13 10c-4 4-8 6-13 6S11 31 7 27Z"
        fill="currentColor"
      />
      <path
        d="M11 18c-2-4 0-8 4-8 3 0 5 2 5 5 0-3 2-5 5-5 4 0 6 4 4 8"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="m11 28-6 5m24-5 6 5M15 24c3 2 7 2 10 0"
        stroke="#F4E2A9"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Brand() {
  return (
    <header className="brand">
      <a href="/" aria-label="LeapSign, inicio">
        <span className="brand-mark">
          <FrogMark />
        </span>
        <span className="brand-name">LeapSign</span>
      </a>
      <span className="brand-tagline">Documentos en movimiento seguro</span>
    </header>
  );
}
function Notice({ message }: { message: string }) {
  return message ? (
    <p className="notice" role="status">
      {message}
    </p>
  ) : null;
}
function DocumentArt() {
  return (
    <figure className="document-art">
      <img
        src="/leapsign-secure-flow.png"
        alt="Tres versiones de un documento avanzan de forma protegida, acompañadas por una rana geométrica en movimiento"
      />
      <figcaption>
        <span>
          <Icon name="lock" size={16} /> Acceso privado
        </span>
        <span>
          <Icon name="refresh" size={16} /> Una versión vigente
        </span>
        <span>
          <Icon name="shield" size={16} /> Control del creador
        </span>
      </figcaption>
    </figure>
  );
}
function SecurityStrip() {
  return (
    <div className="security-strip" aria-label="Controles de privacidad">
      <span>
        <Icon name="lock" size={17} />
        <b>Privado</b> por diseño
      </span>
      <span>
        <Icon name="clock" size={17} />
        Enlaces temporales
      </span>
      <span>
        <Icon name="shield" size={17} />
        Acceso restringido
      </span>
    </div>
  );
}
function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <span className="footer-mark">
          <FrogMark />
        </span>
        <span>© {new Date().getFullYear()} Pablo Martínez</span>
      </div>
      <nav aria-label="Información legal">
        <a href="/privacidad">Privacidad</a>
        <a href="/seguridad">Seguridad</a>
        <a href="/condiciones">Condiciones de uso</a>
        <a href="mailto:pabloun@gmail.com">Contacto</a>
      </nav>
    </footer>
  );
}
async function functionError(error: any, fallback: string) {
  try {
    const body =
      error?.context && typeof error.context.json === "function"
        ? await error.context.json()
        : null;
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

const ISSUE_REASONS = [
  "La firma está en un lugar incorrecto",
  "El archivo no corresponde a este proceso",
  "El PDF no se puede abrir o parece corrupto",
  "Otro problema",
] as const;

const LEGAL_CONTENT = {
  privacidad: {
    eyebrow: "Transparencia y privacidad",
    title: "Tus documentos no son nuestro producto.",
    intro:
      "LeapSign trata únicamente los datos necesarios para coordinar cada proceso. No vendemos información, no analizamos el contenido para publicidad y no hacemos públicos tus documentos.",
    sections: [
      [
        "Qué tratamos",
        "Correo de la cuenta del creador; título, mensaje y estado del proceso; PDF original y versiones incorporadas; y, cuando se facilitan, nombre y correo de participantes. También conservamos registros técnicos mínimos para seguridad y trazabilidad.",
      ],
      [
        "Cómo se protegen",
        "Los PDF permanecen en almacenamiento privado. El acceso se concede mediante enlaces de duración limitada y controles del servidor. Las comunicaciones usan HTTPS/TLS y la infraestructura aplica cifrado en reposo. LeapSign no ofrece cifrado de extremo a extremo y ningún sistema conectado puede prometer riesgo cero.",
      ],
      [
        "Cuánto tiempo",
        "Los documentos se mantienen mientras el proceso está activo o hasta que el creador los elimina o finaliza conforme a los controles disponibles. Al eliminar un proceso se solicita la purga de sus archivos privados y metadatos asociados, salvo obligaciones legales o copias técnicas temporales del proveedor.",
      ],
      [
        "Tus derechos",
        "Puedes acceder a tus procesos, descargar sus versiones y eliminarlos desde tu espacio. Para consultas de acceso, rectificación, supresión, limitación u oposición, escribe a pabloun@gmail.com.",
      ],
    ],
  },
  seguridad: {
    eyebrow: "Arquitectura de confianza",
    title: "Privacidad verificable, sin promesas vacías.",
    intro:
      "LeapSign separa la identidad del creador, el acceso temporal del participante y el almacenamiento privado del documento.",
    sections: [
      [
        "01 · Acceso mínimo",
        "Cada creador ve exclusivamente sus propios procesos. Los participantes solo reciben la versión vigente durante su turno y mediante una URL temporal.",
      ],
      [
        "02 · Secretos fuera del navegador",
        "Las credenciales de servicio, claves de correo y permisos administrativos no se incluyen en la aplicación web ni en los enlaces compartidos.",
      ],
      [
        "03 · Historial controlado",
        "Cada versión se encadena al documento anterior. El creador puede detener, reanudar, volver a una versión o aceptar la versión final con confirmación explícita.",
      ],
      [
        "04 · Alcance real",
        "LeapSign coordina entregas y turnos de PDF. No valida por sí mismo la identidad, el certificado ni la validez jurídica de una firma digital; esa comprobación corresponde a las herramientas de firma y a las partes.",
      ],
    ],
  },
  condiciones: {
    eyebrow: "Condiciones de uso",
    title: "Un marco claro para usar LeapSign.",
    intro:
      "Al utilizar LeapSign aceptas emplearlo de forma lícita, proteger los enlaces de acceso y comprobar el documento antes de incorporarlo al proceso.",
    sections: [
      [
        "Naturaleza del servicio",
        "LeapSign facilita la circulación ordenada de versiones PDF. No es una autoridad certificadora, un servicio de identificación, una notaría ni asesoramiento jurídico. La incorporación de un archivo no acredita por sí sola la autenticidad o validez legal de una firma.",
      ],
      [
        "Responsabilidad del usuario",
        "El creador debe contar con base legítima para tratar los documentos y datos de participantes. Cada firmante debe verificar el archivo, usar una herramienta de firma adecuada y no compartir su turno o enlace.",
      ],
      [
        "Disponibilidad y conservación",
        "El servicio puede cambiar, suspenderse o requerir mantenimiento. Descarga la versión final que necesites conservar; LeapSign no debe utilizarse como archivo permanente ni como única copia de un documento.",
      ],
      [
        "Titularidad y contacto",
        "Servicio y diseño © 2026 Pablo Martínez. Contacto: pabloun@gmail.com. Los documentos pertenecen a sus respectivos titulares; subirlos a LeapSign no transfiere su propiedad.",
      ],
    ],
  },
} as const;

function LegalPage({ page }: { page: keyof typeof LEGAL_CONTENT }) {
  const content = LEGAL_CONTENT[page];
  return (
    <main className="legal-page">
      <Brand />
      <article className="legal-shell">
        <a className="back-link" href="/">
          <Icon name="arrow" size={17} /> Volver a LeapSign
        </a>
        <header>
          <span>{content.eyebrow}</span>
          <h1>{content.title}</h1>
          <p>{content.intro}</p>
        </header>
        <div className="legal-grid">
          {content.sections.map(([title, body]) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
        <aside className="legal-note">
          <Icon name="mail" />
          <div>
            <strong>¿Necesitas aclarar algo?</strong>
            <p>
              Escribe a <a href="mailto:pabloun@gmail.com">pabloun@gmail.com</a>
              . Estos textos ofrecen información general y no sustituyen
              asesoramiento jurídico profesional.
            </p>
          </div>
        </aside>
        <p className="legal-updated">
          Última actualización: 14 de octubre de 2026.
        </p>
      </article>
    </main>
  );
}

function RoundAccess({ id }: { id: string }) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [issueReason, setIssueReason] = useState("");
  const [issueDetail, setIssueDetail] = useState("");
  const [signedDocument, setSignedDocument] = useState<File | null>(null);
  const [reviewedPrevious, setReviewedPrevious] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [round, setRound] = useState<{ title: string; message: string } | null>(
    null,
  );
  const [turn, setTurn] = useState<{
    state: string;
    position?: number;
    expires_at?: string;
    pdfUrl?: string;
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [turnExpired, setTurnExpired] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const query = new URLSearchParams(window.location.search);
  const turnToken = query.get("turn") || "";
  const queueToken = query.get("queue") || "";
  const [autoOpened, setAutoOpened] = useState(false);
  const [autoRestored, setAutoRestored] = useState(false);
  const sessionId =
    localStorage.getItem("firmador-turn") || crypto.randomUUID();
  localStorage.setItem("firmador-turn", sessionId);
  useEffect(() => {
    if ((!queueToken && !turnToken) || round || autoOpened) return;
    setAutoOpened(true);
    void loadRound("");
  }, [queueToken, turnToken, round, autoOpened]);
  useEffect(() => {
    if ((!queueToken && !turnToken) || !round || autoRestored) return;
    setAutoRestored(true);
    void takeTurn();
  }, [queueToken, turnToken, round, autoRestored]);
  useEffect(() => {
    if (turn?.state !== "waiting") return;
    const timer = window.setInterval(() => {
      void takeTurn();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [turn?.state]);
  useEffect(() => {
    if (turn?.state !== "active" || !turn.expires_at) return;
    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(turn.expires_at!).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining === 0) setTurnExpired(true);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [turn?.state, turn?.expires_at]);
  async function openRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadRound(key);
  }
  async function loadRound(groupKey: string) {
    setBusy(true);
    const s = await getSupabase();
    const { data, error } = await s.functions.invoke("get-round", {
      body: { id, groupKey },
    });
    if (error || !data)
      setNotice(
        queueToken || turnToken
          ? "Este enlace corresponde a una ronda protegida. Introduce la clave de acceso para consultar tu turno."
          : "No pudimos abrir este documento. Comprueba la clave.",
      );
    else {
      setKey(groupKey);
      setRound(data);
      setNotice("");
    }
    setBusy(false);
  }
  async function takeTurn() {
    if (!name.trim() && !queueToken && !turnToken)
      return setNotice("Escribe tu nombre para tomar un turno.");
    setBusy(true);
    const s = await getSupabase();
    const { data, error } = await s.functions.invoke("take-open-turn", {
      body: {
        id,
        groupKey: key,
        name,
        email,
        sessionId,
        turnToken,
        queueToken,
      },
    });
    if (error || !data)
      setNotice(
        await functionError(
          error,
          data?.error ||
            "No pudimos asignarte un turno. Inténtalo de nuevo en unos segundos.",
        ),
      );
    else {
      setTurnExpired(false);
      setTurn(data);
      if (data.holder_name) setName(data.holder_name);
      if (data.email) setEmail(data.email);
      setNotice("");
    }
    setBusy(false);
  }
  async function release() {
    const s = await getSupabase();
    await s.functions.invoke("release-open-turn", { body: { id, sessionId } });
    setTurn(null);
    setNotice("Turno liberado.");
  }
  async function submitSignedVersion() {
    if (!signedDocument || !reviewedPrevious)
      return setNotice("Confirma la revisión y selecciona el PDF firmado.");
    setBusy(true);
    const form = new FormData();
    form.set("id", id);
    form.set("groupKey", key);
    form.set("sessionId", sessionId);
    form.set("reviewedPrevious", "true");
    form.set("document", signedDocument);
    const s = await getSupabase();
    const { data, error } = await s.functions.invoke("submit-signed-version", {
      body: form,
    });
    if (error || !data)
      setNotice(
        await functionError(
          error,
          data?.error || "No pudimos incorporar el PDF firmado.",
        ),
      );
    else {
      setTurn(null);
      setSubmitted(true);
      setNotice("");
    }
    setBusy(false);
  }
  async function reportIssue() {
    if (!ISSUE_REASONS.includes(issueReason as (typeof ISSUE_REASONS)[number]))
      return setNotice("Elige el motivo de la incidencia.");
    if (issueReason === "Otro problema" && issueDetail.trim().length > 500)
      return setNotice("La observación puede tener hasta 500 caracteres.");
    setBusy(true);
    const s = await getSupabase();
    const { error } = await s.functions.invoke("report-open-error", {
      body: {
        id,
        groupKey: key,
        sessionId,
        reason: issueReason,
        detail: issueDetail,
        reporterName: name,
        reporterEmail: email,
      },
    });
    if (error)
      setNotice(
        await functionError(error, "No pudimos registrar la incidencia."),
      );
    else {
      setTurn(null);
      setRound(null);
      setNotice(
        "El proceso se detuvo para que el creador revise la incidencia.",
      );
    }
    setBusy(false);
  }
  if (!round)
    return (
      <main className="round">
        <Brand />
        <section className="round-card">
          <span className="file-chip">
            <Icon name="file" size={14} /> Documento privado
          </span>
          <h1>Documento para firmar</h1>
          <form onSubmit={openRound}>
            <label>
              Clave de acceso <em>Si aplica</em>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoFocus
              />
            </label>
            <button className="primary wide" disabled={busy}>
              Continuar
            </button>
          </form>
          <Notice message={notice} />
        </section>
      </main>
    );
  if (submitted)
    return (
      <main className="round">
        <Brand />
        <section className="round-card">
          <span className="file-chip success">
            <Icon name="check" size={14} /> Incorporado
          </span>
          <h1>Documento enviado</h1>
          <p>
            Tu versión quedó guardada. El siguiente turno se habilitará
            automáticamente.
          </p>
        </section>
      </main>
    );
  if (turn?.state === "active" && turnExpired)
    return (
      <main className="round">
        <Brand />
        <section className="round-card expired-card">
          <span className="file-chip warning">
            <Icon name="clock" size={14} /> Turno vencido
          </span>
          <h1>Se terminó tu tiempo</h1>
          <p>
            Para respetar a las demás personas, tu turno se liberó. Puedes
            volver a solicitar un intento y entrarás al final de la cola.
          </p>
          <button className="primary wide" onClick={takeTurn} disabled={busy}>
            {busy ? "Solicitando…" : "Solicitar un nuevo intento"}
          </button>
          <Notice message={notice} />
        </section>
      </main>
    );
  if (turn?.state === "active")
    return (
      <main className="round">
        <Brand />
        <section className="round-card">
          <span className="file-chip success">
            <Icon name="clock" size={14} /> Tu turno
          </span>
          <h1>{round.title}</h1>
          <div className="turn-timer">
            <small>Tiempo restante</small>
            <strong>
              {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
              {String(secondsLeft % 60).padStart(2, "0")}
            </strong>
            <span>El turno vence si no finalizas dentro de este tiempo.</span>
          </div>
          <div className="signing-step">
            <h2>Firma en tres pasos</h2>
            <ol className="flow-steps">
              <li>
                <span>
                  <Icon name="download" />
                </span>
                <div>
                  <strong>Descarga</strong>
                  <small>Obtén la versión vigente.</small>
                </div>
              </li>
              <li>
                <span>
                  <FrogMark />
                </span>
                <div>
                  <strong>Firma</strong>
                  <small>Utiliza FirmaEC o Adobe.</small>
                </div>
              </li>
              <li>
                <span>
                  <Icon name="upload" />
                </span>
                <div>
                  <strong>Incorpora</strong>
                  <small>Sube el mismo PDF firmado.</small>
                </div>
              </li>
            </ol>
            <a
              className="primary"
              href={turn.pdfUrl}
              target="_blank"
              rel="noreferrer"
              download
            >
              <Icon name="download" size={18} /> Descargar documento a firmar
            </a>
            <label className={`upload ${signedDocument ? "has-file" : ""}`}>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setSignedDocument(e.target.files?.[0] ?? null)}
              />
              <span className="upload-icon">
                <Icon name="upload" />
              </span>
              <span>
                <strong>
                  {signedDocument
                    ? signedDocument.name
                    : "Seleccionar el PDF firmado"}
                </strong>
                <small>
                  {signedDocument
                    ? `${Math.ceil(signedDocument.size / 1024)} KB`
                    : "Solo la copia descargada y firmada · máximo 10 MB"}
                </small>
              </span>
            </label>
            <label className="review-check">
              <input
                type="checkbox"
                checked={reviewedPrevious}
                onChange={(e) => setReviewedPrevious(e.target.checked)}
              />
              Confirmo que el documento que descargué era correcto.
            </label>
            <button
              className="primary wide"
              onClick={submitSignedVersion}
              disabled={busy}
            >
              {busy ? "Incorporando…" : "Incorporar PDF firmado y continuar →"}
            </button>
          </div>
          <button className="text-button" onClick={release}>
            Liberar turno sin firmar
          </button>
          <aside className="scope-note">
            <Icon name="shield" size={18} />
            <p>
              <strong>Alcance del servicio.</strong> LeapSign coordina versiones
              y turnos; no certifica la identidad ni la validez jurídica de la
              firma. Comprueba el PDF y utiliza una herramienta de firma
              adecuada.
            </p>
          </aside>
          <fieldset className="issue-box">
            <legend>
              Informar una incidencia <em>Detiene el proceso</em>
            </legend>
            <label>
              Motivo
              <select
                value={issueReason}
                onChange={(e) => setIssueReason(e.target.value)}
              >
                <option value="">Selecciona una opción</option>
                {ISSUE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </label>
            {issueReason === "Otro problema" && (
              <label>
                Observación <em>Opcional</em>
                <textarea
                  value={issueDetail}
                  maxLength={500}
                  placeholder="Añade un detalle breve que ayude al creador."
                  onChange={(e) => setIssueDetail(e.target.value)}
                />
              </label>
            )}
            <button
              className="text-button danger"
              onClick={reportIssue}
              disabled={busy}
            >
              Detener e informar
            </button>
          </fieldset>
          <Notice message={notice} />
        </section>
      </main>
    );
  return (
    <main className="round">
      <Brand />
      <section className="round-card">
        <span className="file-chip">
          <Icon name="file" size={14} /> Documento privado
        </span>
        <h1>{round.title}</h1>
        {round.message && <p>{round.message}</p>}
        <label>
          Tu nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como quieres aparecer"
          />
        </label>
        <label>
          Correo <em>Opcional</em>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Te avisaremos cuando sea tu turno"
          />
        </label>
        {turn?.state === "waiting" && (
          <p className="queue">
            Estás en espera · posición {turn.position}. Te avisaremos por correo
            si lo indicaste; también comprobamos tu turno automáticamente.
          </p>
        )}
        <button className="primary wide" onClick={takeTurn} disabled={busy}>
          {turn?.state === "waiting"
            ? "Comprobar turno"
            : "Tomar turno para firmar"}
        </button>
        <Notice message={notice} />
      </section>
    </main>
  );
}

type OwnerRound = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  signature_count: number;
};
function OwnerPanel() {
  const [rounds, setRounds] = useState<OwnerRound[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [notice, setNotice] = useState("");
  async function loadRounds() {
    const s = await getSupabase();
    const { data, error } = await s
      .from("workflows")
      .select("id,title,status,created_at,signature_count")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) setNotice("No pudimos cargar tus rondas.");
    else setRounds((data ?? []) as OwnerRound[]);
  }
  async function openRound(id: string) {
    const s = await getSupabase();
    const { data, error } = await s.functions.invoke("get-owner-round", {
      body: { id },
    });
    if (error || !data)
      setNotice("No pudimos cargar el seguimiento de la ronda.");
    else {
      setSelected(data);
      setNotice("");
    }
  }
  async function manageRound(
    action:
      | "pause"
      | "resume"
      | "release_turn"
      | "skip_next"
      | "rollback"
      | "finalize"
      | "purge",
    versionId?: string,
    workflowId?: string,
  ) {
    const roundId = workflowId ?? selected?.workflow.id;
    if (!roundId) return;
    const irreversible = action === "rollback" || action === "finalize";
    const warning =
      action === "purge"
        ? "Eliminarás permanentemente este proceso, sus versiones y sus archivos privados. Esta acción no se puede deshacer. ¿Continuar?"
        : action === "rollback"
          ? "Volverás a esta versión. Las posteriores se eliminarán y se liberará el turno activo. ¿Continuar?"
          : action === "finalize"
            ? "Aceptarás esta versión como final. Las anteriores se eliminarán y el proceso se cerrará. Esta acción no se puede deshacer. ¿Continuar?"
            : "";
    if ((action === "purge" || irreversible) && !window.confirm(warning))
      return;
    const s = await getSupabase();
    const { data, error } = await s.functions.invoke("owner-round-action", {
      body: {
        id: roundId,
        action,
        versionId,
        confirmPurge: action === "purge",
        confirmIrreversible: irreversible,
      },
    });
    if (error || !data?.ok)
      setNotice(data?.error || "No pudimos aplicar ese cambio.");
    else if (action === "purge") {
      if (selected?.workflow.id === roundId) setSelected(null);
      setNotice("Proceso eliminado y archivos purgados.");
      await loadRounds();
    } else {
      setNotice(
        action === "release_turn"
          ? "Turno liberado; se avisará a la siguiente persona."
          : action === "skip_next"
            ? "La primera persona en espera fue retirada de la cola."
            : action === "pause"
              ? "Proceso detenido."
              : action === "resume"
                ? "Proceso reanudado."
                : action === "rollback"
                  ? "Se recuperó la versión seleccionada y el proceso continúa desde ella."
                  : action === "finalize"
                    ? "La versión final fue aceptada; el proceso quedó cerrado."
                    : "Cambio aplicado.",
      );
      await openRound(roundId);
      await loadRounds();
    }
  }
  async function downloadVersion(versionId?: string) {
    if (!selected) return;
    const s = await getSupabase();
    const { data, error } = await s.functions.invoke("owner-download-version", {
      body: { id: selected.workflow.id, versionId },
    });
    if (error || !data?.url) setNotice("No pudimos preparar la descarga.");
    else window.open(data.url, "_blank", "noopener");
  }
  const statusText = (status: string) =>
    status === "active"
      ? "En curso"
      : status === "paused_error"
        ? "Detenido por incidencia"
        : status === "completed"
          ? "Finalizado"
          : status === "cancelled"
            ? "Cancelado"
            : status;
  useEffect(() => {
    void loadRounds();
  }, []);
  return (
    <section className="owner-panel">
      <div className="owner-panel-head">
        <div>
          <h2>Seguimiento</h2>
          <p>
            Abre un proceso para ver la cola, el turno y las versiones del
            documento.
          </p>
        </div>
        <button className="signout" onClick={loadRounds}>
          <Icon name="refresh" size={16} /> Actualizar
        </button>
      </div>
      {rounds.length === 0 ? (
        <p className="empty-state">Todavía no has creado ningún proceso.</p>
      ) : (
        <div className="owner-list">
          {rounds.map((round) => (
            <div key={round.id} className="owner-round">
              <button
                className="owner-round-open"
                onClick={() => openRound(round.id)}
              >
                <span>
                  <strong>{round.title}</strong>
                  <small>
                    {statusText(round.status)} · creado{" "}
                    {new Date(round.created_at).toLocaleDateString()}
                  </small>
                </span>
                <span>{round.signature_count} firmas</span>
              </button>
              <button
                className="trash-button"
                aria-label={`Eliminar ${round.title}`}
                title="Eliminar proceso"
                onClick={() => manageRound("purge", undefined, round.id)}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <div className="owner-detail">
          <div className="owner-detail-top">
            <div>
              <h3>{selected.workflow.title}</h3>
              <p>{statusText(selected.workflow.status)}</p>
            </div>
            <div className="owner-actions">
              {selected.workflow.status === "active" ? (
                <button
                  className="signout"
                  onClick={() => manageRound("pause")}
                >
                  Detener
                </button>
              ) : (
                <button
                  className="signout"
                  onClick={() => manageRound("resume")}
                >
                  Reanudar
                </button>
              )}
              {selected.activeTurn && (
                <button
                  className="signout"
                  onClick={() => manageRound("release_turn")}
                >
                  Liberar turno
                </button>
              )}
              {selected.queue.length > 0 && (
                <button
                  className="signout"
                  onClick={() => manageRound("skip_next")}
                >
                  Saltar siguiente
                </button>
              )}
              <button className="signout" onClick={() => downloadVersion()}>
                <Icon name="download" size={16} /> Descargar actual
              </button>
              <button
                className="danger-button"
                onClick={() => manageRound("purge")}
              >
                <Icon name="trash" size={16} /> Eliminar proceso
              </button>
            </div>
          </div>
          <dl>
            <div>
              <dt>Documento actual</dt>
              <dd>
                Versión{" "}
                {selected.versions.find(
                  (version: any) =>
                    version.id === selected.workflow.current_version_id,
                )?.sequence ?? 0}
              </dd>
            </div>
            <div>
              <dt>Quién lo tiene</dt>
              <dd>
                {selected.activeTurn
                  ? `${selected.activeTurn.holder_name}${selected.activeTurn.email ? ` · ${selected.activeTurn.email}` : ""} · hasta ${new Date(selected.activeTurn.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Disponible"}
              </dd>
            </div>
            <div>
              <dt>En espera</dt>
              <dd>
                {selected.queue.length
                  ? selected.queue
                      .map(
                        (item: any) =>
                          `${item.holder_name}${item.email ? ` · ${item.email}` : ""}`,
                      )
                      .join(", ")
                  : "Nadie"}
              </dd>
            </div>
          </dl>
          <h4>Historial de versiones</h4>
          <ul className="submission-list">
            {selected.versions.map((version: any) => (
              <li key={version.id}>
                <strong>
                  Versión {version.sequence}
                  {version.id === selected.workflow.current_version_id
                    ? " · actual"
                    : ""}
                </strong>
                <span>
                  {Math.ceil(version.byte_size / 1024)} KB ·{" "}
                  {new Date(version.created_at).toLocaleString()}
                </span>
                <div className="version-actions">
                  <button
                    className="text-button"
                    onClick={() => downloadVersion(version.id)}
                  >
                    Descargar
                  </button>
                  {version.id !== selected.workflow.current_version_id && (
                    <button
                      className="text-button"
                      onClick={() => manageRound("rollback", version.id)}
                    >
                      Volver a esta versión
                    </button>
                  )}
                  {version.id === selected.workflow.current_version_id &&
                    selected.workflow.status !== "completed" && (
                      <button
                        className="text-button"
                        onClick={() => manageRound("finalize", version.id)}
                      >
                        Aceptar versión final
                      </button>
                    )}
                </div>
              </li>
            ))}
          </ul>
          {selected.reports.length > 0 && (
            <>
              <h4>Incidencias</h4>
              <ul className="submission-list">
                {selected.reports.map((report: any) => (
                  <li key={report.id}>
                    <strong>{report.reason || "Incidencia"}</strong>
                    <span>{report.detail || "No disponible"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <Notice message={notice} />
    </section>
  );
}

function App() {
  const legalPage = window.location.pathname.slice(
    1,
  ) as keyof typeof LEGAL_CONTENT;
  if (legalPage in LEGAL_CONTENT) return <LegalPage page={legalPage} />;
  const match = window.location.pathname.match(/^\/r\/([0-9a-f-]{36})$/i);
  if (match) return <RoundAccess id={match[1]} />;
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recovering, setRecovering] = useState(
    window.location.hash.includes("type=recovery"),
  );
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [key, setKey] = useState("");
  const [document, setDocument] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [createdLink, setCreatedLink] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let unsubscribe = () => {};
    getSupabase()
      .then((supabase) => {
        supabase.auth.getSession().then(({ data }) => setSession(data.session));
        const { data } = supabase.auth.onAuthStateChange((event, next) => {
          setSession(next);
          if (event === "PASSWORD_RECOVERY") setRecovering(true);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch(() =>
        setNotice(
          "No pudimos abrir tu espacio. Recarga la página e inténtalo de nuevo.",
        ),
      );
    return () => unsubscribe();
  }, []);
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error)
      setNotice(
        "No pudimos iniciar sesión. Revisa tus datos o crea una cuenta.",
      );
    setBusy(false);
  }
  async function signUp() {
    setBusy(true);
    setNotice("");
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setNotice(
      error
        ? "No pudimos crear la cuenta. Usa una contraseña de al menos 8 caracteres."
        : "Cuenta creada. Revisa tu correo para confirmarla.",
    );
    setBusy(false);
  }
  async function requestRecovery() {
    if (!email.trim())
      return setNotice(
        "Escribe tu correo y pulsa de nuevo para recibir el enlace.",
      );
    setBusy(true);
    setNotice("");
    const supabase = await getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setNotice(
      error
        ? "No pudimos enviar el enlace de recuperación. Comprueba el correo."
        : "Te enviamos un enlace para crear una nueva contraseña.",
    );
    setBusy(false);
  }
  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8)
      return setNotice("La nueva contraseña debe tener al menos 8 caracteres.");
    setBusy(true);
    const supabase = await getSupabase();
    const { error } = await supabase.auth.updateUser({ password });
    if (error)
      setNotice(
        "No pudimos actualizar tu contraseña. Abre de nuevo el enlace del correo.",
      );
    else {
      await supabase.auth.signOut();
      setSession(null);
      setRecovering(false);
      window.history.replaceState({}, "", window.location.pathname);
      setNotice("Contraseña actualizada. Ya puedes iniciar sesión.");
    }
    setBusy(false);
  }
  async function createRound() {
    if (!session) return;
    if (!title.trim() || !document)
      return setNotice("Añade un nombre y el PDF para continuar.");
    setBusy(true);
    setCreatedLink("");
    setNotice("Preparando tu ronda…");
    const form = new FormData();
    form.set("title", title);
    form.set("message", message);
    form.set("groupKey", key);
    form.set("document", document);
    const supabase = await getSupabase();
    const { data, error } = await supabase.functions.invoke("create-round", {
      body: form,
    });
    if (error)
      setNotice(
        "No pudimos crear la ronda. Comprueba el PDF e inténtalo de nuevo.",
      );
    else {
      setNotice("");
      setCreatedLink(`${window.location.origin}/r/${data.id}`);
    }
    setBusy(false);
  }

  if (recovering)
    return (
      <main className="auth">
        <Brand />
        <div className="auth-grid">
          <section className="welcome">
            <DocumentArt />
            <span className="eyebrow">Acceso protegido</span>
            <h1>Recupera tu espacio.</h1>
            <p>
              Crea una contraseña nueva para volver a gestionar tus documentos.
            </p>
            <SecurityStrip />
          </section>
          <section className="login-card">
            <span className="card-kicker">
              <Icon name="lock" size={16} /> Seguridad de la cuenta
            </span>
            <h2>Nueva contraseña</h2>
            <p>Usa al menos 8 caracteres.</p>
            <form onSubmit={updatePassword}>
              <label>
                Nueva contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                  autoFocus
                />
              </label>
              <button className="primary wide" disabled={busy}>
                {busy ? "Guardando…" : "Guardar contraseña"}
              </button>
            </form>
            <Notice message={notice} />
          </section>
        </div>
      </main>
    );
  if (!session)
    return (
      <main className="auth">
        <Brand />
        <div className="auth-grid">
          <section className="welcome">
            <DocumentArt />
            <span className="eyebrow">Firma secuencial de documentos</span>
            <h1>
              Cada firma avanza.
              <br />
              Cada versión, bajo control.
            </h1>
            <p>
              LeapSign organiza el recorrido de un PDF, una persona a la vez,
              sin exponer el documento.
            </p>
            <SecurityStrip />
          </section>
          <section className="login-card">
            <span className="card-kicker">
              <Icon name="shield" size={16} /> Espacio privado
            </span>
            <h2>Accede a LeapSign</h2>
            <p>Gestiona tus procesos y versiones.</p>
            <form onSubmit={authenticate}>
              <label>
                Correo
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label>
                Contraseña
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </label>
              <button className="primary wide" disabled={busy}>
                {busy ? "Un momento…" : "Entrar de forma segura"}
              </button>
              <button
                className="text-button"
                type="button"
                onClick={requestRecovery}
                disabled={busy}
              >
                ¿Olvidaste tu contraseña?
              </button>
              <button
                className="text-button"
                type="button"
                onClick={signUp}
                disabled={busy}
              >
                Crear una cuenta
              </button>
            </form>
            <Notice message={notice} />
            <p className="form-legal">
              Al continuar aceptas las{" "}
              <a href="/condiciones">condiciones de uso</a> y la{" "}
              <a href="/privacidad">política de privacidad</a>.
            </p>
          </section>
        </div>
      </main>
    );

  return (
    <main className="workspace">
      <Brand />
      <div className="workspace-head">
        <div>
          <span className="eyebrow">Panel de control</span>
          <h1>Tus documentos, en orden.</h1>
          <p>Sesión iniciada como {session.user.email}</p>
        </div>
        <button
          className="signout"
          onClick={() =>
            getSupabase().then((supabase) => supabase.auth.signOut())
          }
        >
          Salir
        </button>
      </div>
      <div className="workspace-intro">
        <div>
          <Icon name="file" />
          <span>
            <strong>Una versión vigente</strong>
            <small>Evita copias cruzadas durante la firma.</small>
          </span>
        </div>
        <div>
          <Icon name="users" />
          <span>
            <strong>Un turno cada vez</strong>
            <small>Cada persona recibe el PDF cuando corresponde.</small>
          </span>
        </div>
        <div>
          <Icon name="shield" />
          <span>
            <strong>Control del creador</strong>
            <small>Detén, recupera o finaliza el proceso.</small>
          </span>
        </div>
      </div>
      <section className="create-card">
        <div className="form-section">
          <div className="step-title">
            <span>1</span>
            <div>
              <h2>Documento</h2>
              <p>PDF de hasta 10 MB</p>
            </div>
          </div>
          <label>
            Nombre del documento
            <input
              value={title}
              maxLength={120}
              placeholder="Ej. Presupuesto 2026"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className={`upload ${document ? "has-file" : ""}`}>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setDocument(e.target.files?.[0] ?? null)}
            />
            <span className="upload-icon">
              <Icon name="upload" />
            </span>
            <span>
              <strong>{document ? document.name : "Seleccionar PDF"}</strong>
              <small>
                {document
                  ? `${Math.ceil(document.size / 1024)} KB`
                  : "PDF · máximo 10 MB"}
              </small>
            </span>
          </label>
        </div>
        <div className="form-section">
          <div className="step-title">
            <span>2</span>
            <div>
              <h2>Acceso</h2>
            </div>
          </div>
          <label>
            Mensaje <em>Opcional</em>
            <textarea
              value={message}
              maxLength={500}
              placeholder="Añade una nota para quienes firmarán."
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <label>
            Clave de acceso <em>Opcional</em>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Clave para el enlace"
            />
          </label>
        </div>
        <div className="create-action">
          <p>
            <Icon name="lock" size={15} /> Almacenamiento privado y acceso
            mediante enlaces temporales.
          </p>
          <button className="primary" onClick={createRound} disabled={busy}>
            {busy ? (
              "Creando…"
            ) : (
              <>
                <span>Crear enlace</span>
                <Icon name="arrow" size={17} />
              </>
            )}
          </button>
        </div>
        <p className="process-disclaimer">
          Al crear el proceso confirmas que puedes tratar este documento y los
          datos de sus participantes. LeapSign organiza la entrega; no sustituye
          la verificación jurídica o criptográfica de las firmas.
        </p>
        {createdLink && (
          <div className="share-link" role="status">
            <span>Enlace listo</span>
            <a href={createdLink} target="_blank" rel="noreferrer">
              {createdLink}
            </a>
            <button
              className="text-button"
              onClick={() =>
                navigator.clipboard
                  .writeText(createdLink)
                  .then(() => setNotice("Enlace copiado."))
                  .catch(() =>
                    setNotice("No se pudo copiar; selecciónalo manualmente."),
                  )
              }
            >
              Copiar
            </button>
          </div>
        )}
        <Notice message={notice} />
      </section>
      <OwnerPanel />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <Footer />
  </>,
);
