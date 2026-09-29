# Sofía en Alexa — configuración paso a paso

Alexa es **solo otra interfaz** de Sofía. Cada frase pasa por el mismo command router que usa el iPhone y termina en la misma base de datos:

```
Echo → Alexa Custom Skill → HTTPS POST /api/alexa → command router existente → servicios de Sofía
```

- El endpoint verifica **siempre** la firma y el timestamp de Amazon con el SDK oficial (`ask-sdk-express-adapter`).
- Las acciones que modifican algo piden **“¿Confirmas?”** y usan la misma confirmación que la app.
- Por voz, las cotizaciones solo **leen** corridas guardadas o validadas; Alexa no calcula ninguna nueva.

## 0. Requisitos

- Una cuenta de Amazon Developer, la **misma** con la que está registrado el Echo.
- El Echo configurado en idioma **Español (México)**.
- Sofía corriendo en tu computadora y `cloudflared` instalado (instrucciones abajo).

## 1. Arrancar Sofía protegida con contraseña

El túnel HTTPS publica **toda la app**, no solo `/api/alexa`. Por eso Sofía tiene que arrancar con contraseña. `/api/alexa` queda fuera de esa contraseña porque Amazon firma cada request.

```bash
SOFIA_BASIC_AUTH=mario:una-contraseña-larga npm run demo:iphone
```

## 2. Abrir el túnel

En otra terminal:

```bash
npm run alexa:dev
```

Si falta `cloudflared`, el script indica el comando para instalarlo; nunca instala nada por su cuenta:

| Sistema | Comando |
|---|---|
| macOS | `brew install cloudflared` |
| Windows | `winget install --id Cloudflare.cloudflared` |
| Linux | descargar desde developers.cloudflare.com (sección *Downloads*) |

Cuando el túnel está listo, el script imprime el endpoint:

```
Alexa endpoint:
https://XXXXX.trycloudflare.com/api/alexa
```

La URL es **temporal**: cambia cada vez que reinicias el túnel y no se guarda en git. Cuando cambie, actualízala en el paso 9.

## 3. Crear la skill en Alexa Developer Console

1. Entra a https://developer.amazon.com/alexa/console/ask con la misma cuenta del Echo.
2. **Create Skill**:
   - nombre: `Asistente Sofía`;
   - locale principal: **Spanish (MX)**;
   - tipo: **Other → Custom**;
   - hosting: **Provision your own**.
3. Plantilla: **Start from scratch**.
4. Confirma que el locale sea **Spanish (Mexico)**.
5. **Invocation name**: `asistente sofia`. Los nombres de una sola palabra como “sofia” tienen restricciones, por eso lleva dos.
6. **Interaction Model → JSON Editor**:
   - pega o arrastra `alexa/skill-package/interactionModels/custom/es-MX.json`;
   - haz clic en **Save Model**.
7. Haz clic en **Build Model** y espera a que diga *Build Successful*.
8. **Endpoint**:
   - tipo **HTTPS**;
   - región **Default Region**.
9. Pega la URL que imprimió `npm run alexa:dev`, terminada en `/api/alexa`.
10. Certificado SSL: elige **“My development endpoint is a sub-domain of a domain that has a wildcard certificate from a certificate authority”**. `trycloudflare.com` tiene un certificado de una autoridad de confianza. Haz clic en **Save Endpoints**.
11. En la pestaña **Test**, cambia *Skill testing is enabled in* a **Development**.
12. El Echo debe estar registrado con la **misma cuenta** de Amazon. Las skills en desarrollo solo aparecen en los dispositivos de esa cuenta.
13. Frente al Echo, di: **“Alexa, abre asistente sofia”**.

Opcional: copia el *Skill ID* (`amzn1.ask.skill…`) y arranca Sofía con `ALEXA_SKILL_ID=amzn1.ask.skill…`. Así el endpoint solo acepta requests de tu skill.

Si prefieres **ASK CLI** en lugar de la consola, `alexa/skill-package/skill.json` es el manifiesto. Antes de desplegar, reemplaza `REEMPLAZA-CON-TU-TUNEL` por tu URL.

## 4. Alexa Simulator

En la pestaña **Test** de la consola puedes escribir o hablar sin el Echo:

- `abre asistente sofia`
- después, cada frase de la sección siguiente sin decir “Alexa”; la sesión sigue abierta entre turnos.

El panel *JSON Output* muestra lo que respondió Sofía.

## 5. Frases para probar (en este orden)

| Tú dices | Sofía responde |
|---|---|
| “Alexa, abre asistente sofia” | “Soy Sofía. ¿Qué necesitas, Mario?” |
| “¿Qué tengo pendiente hoy?” | Resumen de hasta 3 pendientes + “Te dejé el detalle en Sofía.” |
| “Busca a Juan” | “Encontré a Juan Pérez.” |
| “¿Qué le falta?” | Lo pendiente de Juan: venta, placas, documentos… |
| “Agenda a Juan mañana a las cinco” | “Voy a agendar a Juan mañana a las 5 de la tarde. ¿Confirmas?” |
| “Sí” | “Cita agendada… Ya quedó en Sofía.” La cita aparece en la Agenda del iPhone. |
| “¿Qué le falta para placas a Juan?” | Documentos pendientes del trámite de placas |
| “¿Cuáles placas tengo pendientes?” | Trámites abiertos |
| “Cotiza una HR-V Touring con 150 mil de enganche a 48 meses” | La corrida validada guardada (DEMO) |
| “Cotiza una HR-V Touring con 170 mil a 36 meses” | “No tengo una corrida guardada para ese escenario. Mario tiene que agregarla.” |
| “Agenda a Carlos mañana a las cinco” → “No” | “Listo, no hice nada.” |
| “Ayuda” / “Para” | Ejemplos de uso / “Hasta luego, Mario.” |

## 6. Cómo hay que hablarle: limitación real de Alexa

- **Palabra de arranque obligatoria.** El texto libre usa el slot `AMAZON.SearchQuery`, y Alexa **no permite** que una frase sea *solo* el slot: siempre necesita una palabra de arranque. Por eso el modelo trae varios intents cuyo único propósito es recuperar esa palabra:

  | Empieza con… | Ejemplo |
  |---|---|
  | qué / que | “¿Qué tengo pendiente hoy?”, “¿Qué le falta?” |
  | cuáles / cuál | “¿Cuáles placas tengo pendientes?” |
  | busca / búscame / encuentra | “Busca a Juan” |
  | agenda / agéndale | “Agenda a Juan mañana a las cinco” |
  | cotiza / cotízame | “Cotiza una HR-V Touring con 150 mil a 48 meses” |
  | registra / anota | “Registra que Ana ya me mandó su comprobante” |
  | marca | “Marca el trámite de Carlos como enviado” |
  | prepara / hazme | “Prepara el correo de placas de Juan” |
  | recuérdame | “Recuérdame llamar a Carlos el viernes a las 10” |
  | cómo va | “¿Cómo va Ana?” |
  | abre | “Abre ventas”. Alexa responde que eso se ve en la pantalla de Sofía. |
  | genéricas: dile a sofía, quiero, necesito, consulta, pregunta, dime, revisa | “Dile a sofía qué tengo pendiente hoy” |

  El adaptador vuelve a unir la palabra de arranque con el resto de la frase y la manda **tal cual** al command router. Si una frase no empieza con ninguna de estas, antepón “dile a sofía …”.
- **Confirmación:** “sí”, “confirmo”, “hazlo”, “adelante”. **Rechazo:** “no”, “cancela”, “déjalo”. Una confirmación caduca a los 5 minutos y no puede reutilizarse.
- **La sesión dura mientras Alexa la mantiene abierta.** Si pasan unos segundos sin hablar, Alexa la cierra; vuelve a decir “Alexa, abre asistente sofia”. Alexa no permite hablarle a una skill sin invocarla primero.
- **Contexto entre turnos:** se guardan `lastCustomerId`, `lastCustomerName` (solo el primer nombre), `lastIntent` y `pendingConfirmationId`. No se guardan teléfonos, RFC ni otros datos. La acción pendiente vive en el servidor; a Alexa solo viaja un ID. Si reinicias Sofía entre la pregunta y el “sí”, la confirmación se pierde y hay que repetir la orden.
- **Nombres propios:** el reconocimiento de voz de Alexa puede escribir mal algunos nombres. Si no encuentra al cliente, Sofía lo dice. Nunca adivina.

## 7. Privacidad

- Por voz **nunca** se leen RFC, CURP, correos, teléfonos, VIN, domicilios completos, datos médicos ni el cuerpo de documentos o correos.
- A Alexa no se mandan PDFs.
- Las respuestas largas se resumen y el detalle se queda en la app.
- En los logs no se guarda lo que dijo Mario.

## 8. Lo que Alexa NO hace

- No calcula cotizaciones nuevas.
- No envía correos sin confirmar; además, hoy no hay cuenta de correo configurada.
- No reemplaza la pantalla para ver detalles.
- No hay jailbreak, firmware, cambio de wake word ni Smart Home.
- No hay infraestructura permanente: el túnel es temporal. Para uso diario hará falta un servidor HTTPS fijo.
