# Guía común para trabajar en Sofía con cualquier IA

Lee esta guía antes de editar. El usuario puede compartir este archivo con Codex, Claude, DeepSeek u otra IA.

## Qué proyecto cambiar

Este repositorio conserva más de una generación de Sofía. La app que hoy usa Mario para WhatsApp es la **PWA de `prueba/`**, y el conector que mantiene la sesión está en `whatsapp-web/`.

- Pantallas y comportamiento en el teléfono/tablet: `prueba/js/` y `prueba/index.html`.
- Cerebro, API, bandeja, CRM automático y agenda: `prueba/servidor/core.mjs`.
- Servidor local y almacenamiento: `prueba/servidor/servidor.mjs`.
- WhatsApp Web vinculado y sesión persistente: `whatsapp-web/cliente.mjs`.
- Inicio en Windows: `whatsapp-web/windows/`.
- La app Next.js de `src/` es otra generación/prototipo; editarla no actualiza la PWA de Mario.

## Cómo se activa un cambio

- Un cambio en `prueba/js/` o `prueba/` requiere publicar la carpeta `prueba/` en GitHub Pages y después recargar Sofía en el teléfono.
- Un cambio en `core.mjs`, `servidor.mjs` o `whatsapp-web/` requiere reiniciar el conector local. El perfil de WhatsApp se guarda en `%LOCALAPPDATA%\\SofiaWhatsAppMario\\datos\\sesion-mario`; **no lo borres ni lo reemplaces**. Normalmente reiniciar reutiliza la sesión y no pide QR.
- El workflow `.github/workflows/prueba.yml` publica GitHub Pages desde las ramas `claude/focused-gauss-q4hxvr` y `claude/laughing-sagan-hbxj3y`. Al publicar, ejecuta además sus verificaciones automatizadas.
- El equipo de Mario debe seguir encendido, conectado a internet y con Sofía abierta para atender usando WhatsApp Web.

## Reglas de edición

- Mantén la interfaz en español claro, móvil primero y usable con una mano.
- Mario es el asesor; Sofía redacta en su estilo, pero no inventes precios, corridas, disponibilidad, aprobaciones ni acciones que no ocurrieron.
- Conserva las conversaciones, prospectos, datos locales y la autenticación de WhatsApp. No borres perfiles, bases o respaldos.
- Nunca copies secretos, tokens, teléfonos o conversaciones reales a Git, ejemplos, prompts compartidos ni logs. Usa solo datos ficticios al documentar.
- No envíes mensajes, difusiones ni hagas cambios destructivos en cuentas reales durante el desarrollo.
- Para una difusión, exige selección visible de destinatarios, vista previa, permiso de contacto y confirmación humana antes de enviar.
- Explica qué se cambió, qué necesita publicación o reinicio y qué sigue funcionando. No digas que quedó activo hasta confirmarlo en la app y el conector.

## Camino para continuar

Antes de editar, revisa el estado de Git y los cambios existentes. Haz cambios pequeños sobre `prueba/` y `whatsapp-web/`, conserva las modificaciones previas, y deja cualquier nueva función de operación masiva detrás de una confirmación explícita. Si la persona usa una IA que no lee instrucciones de repositorio automáticamente, comparte este archivo y `AGENTS.md`.
