# Cotizador exacto — qué falta para cotizar con datos reales

**Checkpoint (Sprint 3):** los archivos recibidos **no contienen información para reproducir cotizaciones**:

| Archivo | Contenido real | ¿Sirve para cotizar? |
|---|---|---|
| `control_de_ventas_Mario.xlsx` | 1 hoja, 17 encabezados, **sin filas de ventas** | No (solo define columnas de ventas) |
| `Solicitud_de_Crédito_BBVA.pdf` / `SOLICITUD_BANORTE_NUEVA.pdf` | Formularios de solicitud de crédito | No (no traen precios, tasas ni corridas) |
| Solicitudes llenas de ejemplo | Datos personales de un cliente | No |

Por eso **no se infirió ninguna regla financiera**. El motor V2 (`src/domain/quote-v2.ts`) ya tiene la
estructura completa y **se niega a dar mensualidad** mientras falte un parámetro:
“Falta información para reproducir esta cotización exactamente.” + lista concreta de lo que falta.

Hoy la demo usa un programa **DEMO ficticio**. Sus “corridas validadas” se generaron con el mismo
motor: demuestran el mecanismo de calibración, **no** la exactitud real.

## Lo que necesitamos de Mario (por cada financiera/programa que use)

### 1. Precios y bonos (por modelo, versión y año)
- [ ] Lista de precios vigente (archivo o foto de la lista oficial) con **fecha de vigencia**.
- [ ] Bonos/promociones vigentes: monto, versión a la que aplica, vigencia y condiciones (¿solo financiando? ¿con qué financiera?).
- [ ] **Cómo entra el bono en la corrida**: ¿baja el precio a financiar o se suma al enganche? (En su Excel existe la columna “COMO SE USARÁ EL BONO”: ¿qué opciones usa?)

### 2. Programa de financiamiento (Honda Finance, BBVA, Banorte, …)
- [ ] Tasa anual por plazo (12/24/36/48/60/72) y si varía por enganche o modelo.
- [ ] ¿La mensualidad incluye **IVA sobre intereses**? (sí/no)
- [ ] **Comisión por apertura**: % y base (¿sobre monto financiado?), ¿lleva IVA?, ¿se paga de contado o se financia?
- [ ] Enganche mínimo (%).
- [ ] Redondeo que usa el cotizador (centavos / pesos).
- [ ] Vigencia del programa.

### 3. Seguro
- [ ] Monto del seguro por modelo/versión (y plazo si cambia) o la tabla de la aseguradora.
- [ ] ¿Se paga de contado, se financia, o va fuera de la corrida? ¿Anual o multianual?

### 4. Otros conceptos que aparezcan en sus corridas
- [ ] Garantía extendida (monto y años — en su Excel hay “MONTO DE GARANTIA” y “AÑOS DE GARANTIA”).
- [ ] Accesorios/adicionales, placas/tenencia, GPS, seguro de vida/desempleo, etc.: ¿cuáles entran a la corrida y cómo?

### 5. Corridas reales para calibrar (lo más importante)
- [ ] **3 a 5 corridas reales** impresas o en PDF del cotizador que usa Mario, por cada programa, con escenarios distintos
  (modelo, enganche y plazo). Con ellas el sistema compara **componente por componente**
  (precio, bono, enganche, comisión, seguro, monto financiado, mensualidad) y solo marca el programa
  como **VALIDATED** si la diferencia es **0** (tolerancia técnica: 1 centavo por redondeo).
  Si no cuadra, se reporta la diferencia y se busca la regla que falta — **nunca se ajusta a mano**.

## Cómo se cargan (cuando lleguen)
Cada dato va a su tabla con fuente y vigencia: `price_books` / `vehicle_prices`, `commercial_offers`
+ `promotion_rules` (bonos), `finance_programs` / `finance_terms`, `quote_components` (seguro, garantía,
accesorios) y `validated_quote_examples` (corridas reales). Después: **Más → Programas → Calibrar**.
