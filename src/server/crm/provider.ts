/**
 * CrmProvider — interfaz para sincronizar Sofía con el CRM de la agencia (p. ej. Sale-U)
 * SIN rehacer Sofía. No hay implementación: Sale-U no tiene documentación pública verificable;
 * falta la documentación oficial y credenciales (ver SALEU_INTEGRATION.md).
 * Prohibido: scraping o automatización no autorizada del portal.
 * La sincronización es determinista (sin IA).
 */

export interface CrmLead {
  /** ID del lead/cliente en el CRM externo (llave de enlace). */
  externalId: string;
  displayName: string;
  phone?: string | null;
  email?: string | null;
  vehicleInterest?: string | null;
  stage?: string | null;
  assignedAdvisor?: string | null;
  updatedAt: Date;
}

export interface CrmActivity {
  externalLeadId: string;
  kind: "call" | "appointment" | "note" | "quote_sent" | "application_submitted";
  at: Date;
  summary: string;
}

export interface CrmProvider {
  readonly name: string;
  readonly configured: boolean;
  /** Leads/clientes modificados desde una fecha (paginado por el proveedor). */
  listLeadsSince(since: Date): Promise<CrmLead[]>;
  getLead(externalId: string): Promise<CrmLead | null>;
  /** Registrar actividad de Sofía en el CRM (solo si el CRM lo permite y Mario lo autoriza). */
  pushActivity(activity: CrmActivity): Promise<void>;
}

/** Sin CRM conectado: no hace nada y lo dice. */
export const noCrm: CrmProvider = {
  name: "none",
  configured: false,
  async listLeadsSince() {
    return [];
  },
  async getLead() {
    return null;
  },
  async pushActivity() {},
};

/**
 * Lugar reservado para SaleUProvider. Se implementará solo con la API oficial de Sale-U y
 * credenciales del SERVIDOR (nunca en la APK).
 */
export function createCrmProvider(): CrmProvider {
  return noCrm;
}
