/**
 * Modelo de adaptador de solicitud de crédito.
 *
 * Un adaptador (BBVA, Banorte, …) declara "slots": cada uno es un campo de la
 * solicitud con su sección, clasificación y de qué dato del perfil universal sale.
 * El slot es estable; el nombre REAL del campo AcroForm vive en la plantilla
 * (`application_templates.field_mapping`), porque depende de la versión del PDF.
 */
import type { FieldClass } from "../enums";

export type SlotTransform =
  | "upper"
  | "date_ddmmyyyy"
  | "money"
  | "phone10"
  | "enum_label"
  | "int";

export interface SlotCondition {
  profileKey: string;
  equals?: string;
  lessThan?: number;
  /** Texto para Mario: por qué aplica. */
  description: string;
}

export interface ApplicationSlot {
  slot: string;
  section: string;
  label: string;
  class: FieldClass;
  /** Datos del perfil que alimentan el slot (varios se concatenan con espacio). */
  profileKeys?: string[];
  transform?: SlotTransform;
  pdfType: "text" | "checkbox";
  /** Para casillas de datos (no consentimientos): se marca si el valor del perfil es este. */
  checkedWhen?: string;
  condition?: SlotCondition;
  note?: string;
}

export interface CreditAdapter {
  institutionCode: string;
  institutionName: string;
  /** Orden de secciones para la UI. */
  sections: Array<{ id: string; label: string }>;
  slots: ApplicationSlot[];
}
