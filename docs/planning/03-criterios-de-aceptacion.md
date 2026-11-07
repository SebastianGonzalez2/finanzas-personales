# Criterios de aceptación y matriz de pruebas

**Estado:** casos propuestos para la implementación, derivados del producto v9.48. Se deben automatizar en niveles apropiados, no solo afirmar que «funcionan». Referencias: [RF](01-alcance-y-requisitos.md), [invariantes](02-modelo-de-dominio-y-datos.md).  
**Formato:** `Dado / Cuando / Entonces`. Los importes de ejemplo son datos de prueba, no datos bancarios del usuario.

## Identidad y privacidad — F0

| CA | RF | Dado / Cuando / Entonces |
|---|---|---|
| CA-001 | 001–004 | **Dado** usuario A autenticado y datos de B, **cuando** A pide API/URL de movimiento de B, **entonces** recibe acceso denegado y **ningún dato de B**. |
| CA-002 | 001–003 | Dado visitante sin cuenta/código, cuando intenta alta por correo o Google sin invitación válida, entonces el servidor rechaza **antes de crear acceso a datos financieros**. |
| CA-003 | 002 | Dado código grupal válido, cuando dos usuarios distintos se registran, entonces ambos pueden usarlo; al rotarlo se rechaza el viejo en altas nuevas pero no se desactivan cuentas existentes. |
| CA-004 | 003 | Dado registro email/contraseña, cuando no se valida el código numérico, entonces no se habilita el acceso normal; reenvío y caducidad tienen límites. |
| CA-005 | 003 | Dado usuario con contraseña olvidada, cuando pide restablecimiento, entonces hay flujo oficial seguro; no se revela si el correo existe ni se exponen tokens en logs. |
| CA-006 | 004 | Dado dos sesiones activas del mismo usuario, cuando consulta saldos en ambas, entonces ve el mismo estado confirmado; eventos repetidos no se aplican dos veces. |

## Bancos, movimientos y conciliación — F1

| CA | RF | Dado / Cuando / Entonces |
|---|---|---|
| CA-007 | 005 | Dado Bancos UYU=10.000 y USD=100, cuando se visualizan por moneda, entonces cada saldo conserva su moneda y no se mezcla por suma directa. |
| CA-008 | 006–007 | Dado Bancos UYU=10.000, cuando registro gasto real UYU 1.500 con débito, entonces Bancos=8.500, gasto estadístico=1.500 y una transacción histórica. |
| CA-009 | 006–007 | Dado Bancos UYU=8.500, cuando ingreso UYU 5.000 acreditado, entonces Bancos=13.500, ingreso=5.000 una vez. |
| CA-010 | 006 | Dado gasto sin categoría, cuando se confirma, entonces aplica el mismo débito y aparece en «Sin categorizar», no se oculta ni bloquea el alta. |
| CA-011 | 008 | Dado saldo calculado=9.000 y banco real confirmado=8.700, cuando se registra ajuste fechado, entonces saldo confirmado=8.700 y **no se inventa gasto** de 300. |
| CA-012 | 009 | Dado UYU=10.000 y USD=0, cuando usuario cambia efectivamente UYU 4.000 por USD 100, entonces UYU=6.000, USD=100 y no hay ingreso/gasto estadístico por $4.000/US$100. |
| CA-013 | 010 | Dado gasto de 5.000 registrado equivocadamente en lugar de 500, cuando se corrige, entonces la diferencia se compensa **una sola vez**, con traza, sin reembolso bancario ficticio. |
| CA-014 | 010 | Dado gasto recién guardado, cuando se pulsa «Deshacer», entonces se anula el registro de la app de forma atómica, preservando auditoría; no se cancela ninguna compra externa. |
| CA-015 | 012 | Dado gasto de febrero 2.000, checkpoint de marzo **30.000 confirmado** y fecha de edición junio, cuando se corrige febrero a 1.500, entonces febrero informa 1.500 y **checkpoint marzo sigue 30.000**; se muestra discrepancia de conciliación explicable, no cargo inventado. |
| CA-016 | 010–012 | Dado petición repetida por fallo de red, cuando se reenvía la misma idempotency key, entonces no hay segundo movimiento ni segundo débito. |
| CA-017 | 011 | Dado años de movimientos, cuando filtro octubre + concepto «alquiler» y pagino, entonces resultados pertenecen solo a la cuenta y mantener/cambiar filtro no borra ni edita datos. |
| CA-018 | 013 | Dado saldo no conciliado y estimación de gasto, cuando se muestra el dashboard, entonces no se afirma «saldo real verificado» sin confirmación manual. |
| CA-019 | 006 | Dado compra futura prevista que nunca se hizo, cuando llega la fecha, entonces **no** se crea gasto ni movimiento bancario «planificado». |

## Tarjetas, préstamos y cobros — F2

| CA | RF | Dado / Cuando / Entonces |
|---|---|---|
| CA-020 | 014–015 | Dado Bancos=10.000 y Visa deuda=0, cuando compra crédito=3.000, entonces banco sigue 10.000 y deuda=3.000, gasto se cuenta según regla de compra. |
| CA-021 | 015 | Dado deuda tarjeta=3.000 y banco=10.000, cuando pago resumen=3.000, entonces banco=7.000 y deuda=0, **sin sumar gasto por 3.000 de nuevo**. |
| CA-022 | 016 | Dado compra en 3 cuotas iguales de 2.000, primera en enero, cuando se consultan enero/febrero/marzo, entonces cada mes incluye 2.000 de consumo y no 6.000 en enero más cuotas. |
| CA-023 | 017 | Dado fecha de cierre habitual y un resumen oficial con importe diferente a estimación, cuando se carga oficial, entonces UI muestra ambos con distinción de origen y prioriza oficial en alertas. |
| CA-024 | 018 | Dado deuda total=5.000 y usuario paga 2.000, cuando confirma, entonces deuda=3.000, banco −2.000, estado de resumen sigue parcial según mínimo oficial informado. |
| CA-025 | 019 | Dado compra=3.000 pagada débito 2.000 y crédito 1.000, cuando se guarda, entonces Banco −2.000, Crédito +1.000 y **una compra/gasto** 3.000, no dos. |
| CA-026 | 019 | Dado compra=12.000 con débito 6.000 + crédito 3×2.000, cuando se consulta compra, entonces banco −6.000 real y las cuotas de crédito se imputan a sus meses; sin doble registro de los 12.000. |
| CA-027 | 020 | Dado comercio cobra EUR 50 y emisor carga USD 58 reales, cuando registro el cargo, entonces deuda USD +58 y gasto referenciado correctamente; nunca sumar EUR 50 + USD 58 como dos compras. |
| CA-028 | 021/047 | Dado ropa enero 2.000 y devolución real febrero 500, cuando se recibe abono al banco, entonces el banco aumenta 500; **compras Ropa febrero no cambian** y presupuesto febrero tampoco, devolución visible separadamente. |
| CA-029 | 021 | Dado compra con tarjeta ya pagada y devolución posterior acreditada 300, cuando deuda=0, entonces saldo a favor de tarjeta=300, banco no cambia. |
| CA-030 | 022–023 | Dado banco=10.000, cuando presto 3.000 a Juan, entonces banco=7.000, derecho por cobrar=3.000 y gasto estadístico NO aumenta. |
| CA-031 | 022–023 | Dado cobro de 1.000 de préstamo de Juan, cuando lo confirmo, entonces banco +1.000 y deuda por cobrar −1.000, **ingreso ordinario no aumenta**. |
| CA-032 | 023 | Dado banco=2.000, cuando recibo préstamo por 5.000, entonces banco=7.000 y deuda por pagar=5.000, sin ingreso ordinario. |
| CA-033 | 024 | Dado deuda por pagar USD100 y banco UYU=6.000, cuando pago UYU4.000 aceptados como cancelar USD100, entonces banco UYU=2.000 y deuda USD=0, sin cambiar banco USD. |
| CA-034 | 024 | Dado USD100 por cobrar y cobro real UYU4.000 aceptados como pago completo, cuando se confirma, entonces banco UYU+4.000 y derecho por cobrar USD−100, sin registrar ingreso por recuperación de principal. |
| CA-035 | 025 | Dado cena 4.000 pagada por titular, tres amigos deben 1.000 cada uno, cuando se registra, entonces banco −4.000, **gasto propio 1.000** y tres cuentas por cobrar de 1.000 independientes. |
| CA-036 | 025 | Dado amigo pagó entrada de 1.000 por titular, cuando el titular registra gasto pendiente de pago, entonces gasto personal=1.000, deuda=1.000, banco no cambia; al devolver, banco −1.000, deuda=0 sin gasto adicional. |
| CA-037 | 021 | Dado devolución de compra dividida en Internet 2.000/Telefonía 1.000 y reembolso de Internet 500, cuando se asigna, entonces Internet recibe vínculo de reembolso 500, Telefonía no se modifica y acreditación bancaria real una vez. |

## Ahorro, presupuestos y recurrencias — F3/F4

| CA | RF | Dado / Cuando / Entonces |
|---|---|---|
| CA-038 | 026–027 | Dado banco=10.000, cuando reservo 3.000 en fondo, entonces banco=10.000, reservado=3.000, disponible=7.000 y gasto=0. |
| CA-039 | 028 | Dado aporte automático=1.000 y disponible=700, cuando llega día de ejecución, entonces **no** se aporta parcialmente, banco no cambia y queda un período pendiente explícito. |
| CA-040 | 029 | Dado meta fondo=2.000 y reservado=1.950, aporte mensual=200, cuando se ejecuta, entonces solo 50 se reservan y siguientes automáticos se pausan hasta reactivación expresa. |
| CA-041 | 030 | Dado gasto real 1.200 y fondo autorizado=1.000 + disponible=200, cuando se confirma, entonces gasto=1.200, banco −1.200, fondo −1.000 y no hay segundo gasto. |
| CA-042 | 031–032 | Dado presupuesto Alimentación=10.000, cuando compras efectivas llegan a 8.000 y después 10.000, entonces avisos 80% y 100% una sola vez por umbral/mes, sin emails. |
| CA-043 | 032 | Dado presupuesto habitual 10.000 y excepción diciembre 15.000, cuando llega enero, entonces vuelve a 10.000; diciembre histórico conserva 15.000. |
| CA-044 | 033–034 | Dado seguro creado noviembre con comienzo enero, cuando se crea, entonces no hay pagos/pendientes ficticios noviembre/diciembre; enero es primer período, sin débito bancario automático. |
| CA-045 | 034–035 | Dado sueldo mensual esperado 50.000 y cobrado solo 47.000 confirmado como definitivo, cuando usuario marca «Esto fue todo», entonces período completado 47.000, banco +47.000 real, sin 3.000 por cobrar inventados. |
| CA-046 | 034 | Dado sueldo 50.000 recibido 30.000 día 3 y 20.000 día 8, cuando se vinculan depósitos a un período, entonces banco +50.000 en total, estadísticas +50.000 (no +100.000), período completado. |
| CA-047 | 034–035 | Dado diciembre omitido de ingreso recurrente, cuando llega enero, entonces enero sigue previsto, diciembre no avisa ni crea ingreso. |
| CA-048 | 036 | Dado alquiler 20.000 mensual mitad compartido, cuando usuario registra pago real, entonces banco −20.000, gasto propio 10.000, por cobrar 10.000; en meses no pagados no hay efecto. |
| CA-049 | 037–038 | Dado cuota de préstamo con fecha cierta 20, cuando llega día 17 y sigue pendiente, entonces aviso interno (anticipo predeterminado 3 días); sin fecha no inventa vencimiento. |
| CA-050 | 029 | Dado fondo con meta 2.000, fecha objetivo vencida y saldo reservado=1.600, cuando se visualiza, entonces aviso de meta incumplida, fondo conserva 1.600 y aporte automático activo si no estaba pausado por otra causa. |

## Catálogos, estadísticas y respaldo — F5/F6

| CA | RF | Dado / Cuando / Entonces |
|---|---|---|
| CA-051 | 039 | Dado formulario de gasto incompleto, cuando creo categoría «Mascotas» desde selector, entonces el formulario conserva importe/fecha y selecciona categoría, sin crear gasto antes de confirmar. |
| CA-052 | 040 | Dado un ingreso bancario 55.000, cuando lo divido Sueldo=50.000 y Bonificación=5.000, entonces una entrada bancaria 55.000 y categoría sumada 55.000, no duplicación. |
| CA-053 | 041 | Dado comercios «Tienda Ing.» y «Tienda Inglesa», cuando el usuario confirma fusión, entonces se unifican referencias y los movimientos/estadísticas siguen sin duplicarse. |
| CA-054 | 041 | Dado nombre «Tienda Inglesa» ya guardado, cuando escribo «tienda» o «TIENDA», entonces se sugiere el mismo comercio canónico, sin crear duplicado por capitalización. |
| CA-055 | 041 | Dado Juan con deuda pendiente, cuando archivo el contacto, entonces desaparece del selector normal pero la deuda sigue visible/cobrable e histórica. |
| CA-056 | 042 | Dado gasto de 500 con etiquetas «Italia» y «Vacaciones», cuando sumo gastos globales, entonces gasto=500, **no 1.000**. |
| CA-057 | 043 | Dado 10 gastos sin categoría, cuando selecciono todos y aplico «Alimentación», entonces las 10 clasificaciones cambian y **banco/deuda no cambian**; un gasto dividido que requiera revisión no se sobrescribe silenciosamente. |
| CA-058 | 043 | Dado filtro guardado «Ropa mes actual», cuando cambia el mes, entonces el filtro consulta el nuevo mes, no congela fecha de cuando fue creado. |
| CA-059 | 044–045 | Dado favorito estadístico de usuario A, cuando inicia sesión usuario B, entonces B no hereda preferencias ni ve datos de A; dashboard principal mantiene diseño fijo. |
| CA-060 | 046 | Dado gasto EUR10 en domingo sin cotización publicada, cuando se convierte para gráfico USD, entonces usa última tasa válida anterior/igual al domingo, muestra fecha/fuente y nunca cotización posterior. |
| CA-061 | 048 | Dado reporte filtrado a marzo, cuando exporto PDF/Excel/CSV, entonces solo aparecen los datos autorizados del período y no contraseñas/cookies ni datos de otra cuenta. |
| CA-062 | 048–049 | Dado backup protegido con contraseña, cuando introduzco clave incorrecta, entonces **no se reemplaza ninguna fila**; con clave correcta e integridad válida se confirma reemplazo total seguro. |
| CA-063 | 049 | Dado backup anterior y datos nuevos posteriores, cuando confirmo restauración, entonces se advierte pérdida de cambios posteriores, se ofrece backup actual y se reemplaza solo dominio financiero del titular. |
| CA-064 | 050 | Dado pocos movimientos, cuando se genera «Resumen inteligente», entonces advierte muestra insuficiente y no inventa comercio, tendencia o gasto inexistente. |
| CA-065 | 051–052 | Dado PWA sin conexión, cuando el usuario intenta guardar gasto, entonces no se informa éxito ni se mutan saldos locales como si fueran reales; puede volver a intentar con conexión sin duplicación. |
| CA-066 | 051–052 | Dado móvil y escritorio, cuando se realiza navegación principal, entonces teclado, foco, etiquetas y estados de validación son accesibles y la UI mantiene legibilidad. |
| CA-067 | 053 | Dado cashback no asociado a compra de $300 acreditado por el banco, cuando se registra, entonces ingreso de beneficio=300 y se acredita al medio real, sin alterar compras anteriores. |

## Escenarios integrales de regresión (Gherkin)

```gherkin
Feature: Un pago bancario no duplica gastos
  Scenario: Comprar con crédito y después pagar resumen
    Given Bancos UYU vale 10000 y la tarjeta no tiene deuda
    When registro una compra a crédito UYU 3000
    Then Bancos UYU sigue valiendo 10000 y la deuda pasa a 3000
    When registro pago real del resumen por UYU 3000
    Then Bancos UYU pasa a 7000 y la deuda pasa a 0
    And la compra existe una sola vez en las estadísticas de consumo
```

```gherkin
Feature: Reembolso de otro mes no modifica compras del mes receptor
  Scenario: Enero y febrero
    Given compré ropa UYU 2000 en enero
    And en febrero hice otras compras de ropa por UYU 3000
    And el presupuesto de ropa en febrero es UYU 5000
    When recibo en febrero la devolución de UYU 500 por la compra de enero
    Then el historial de febrero muestra devolución recibida UYU 500 por separado
    And las compras de ropa de febrero siguen sumando UYU 3000
    And el presupuesto de febrero muestra UYU 3000 consumidos y 2000 disponibles
    And la compra de enero sigue registrada con UYU 2000 originales
```

```gherkin
Feature: Checkpoint bancario confirmado no se reescribe
  Scenario: Corrección retroactiva
    Given registré en febrero un gasto por UYU 2000
    And confirmé manualmente Bancos UYU 30000 en marzo
    When en junio corrijo el gasto de febrero a UYU 1500
    Then las estadísticas de febrero utilizan UYU 1500
    And el checkpoint de marzo sigue siendo UYU 30000
    And la conciliación muestra cualquier diferencia resultante
    And la aplicación no fabrica un ingreso ni un gasto para compensar
```

```gherkin
Feature: Gasto recurrente compartido
  Scenario: Alquiler con compañero
    Given alquiler mensual UYU 20000 con parte propia UYU 10000 y de Juan UYU 10000
    When llega el mes pero no confirmo pago real
    Then no cambia Bancos ni gastos ni cuentas por cobrar
    When confirmo que pagué UYU 20000 por débito
    Then Bancos baja UYU 20000 y mi gasto de Vivienda sube UYU 10000
    And queda UYU 10000 por cobrar a Juan
    When Juan me devuelve UYU 4000
    Then el por cobrar a Juan queda UYU 6000
    And Bancos sube UYU 4000 sin ingreso ordinario nuevo
```

## Estrategia mínima de automatización

- **Unitarios dominio:** invariantes I-01…I-12, fechas, monedas, redondeo, saldos, estados, cuotas, reparto, presupuestos, reembolsos y cambios históricos.
- **Integración con PostgreSQL de prueba:** transacciones atómicas, constraints, unicidad, permisos por titular, idempotencia, migraciones y reversiones.
- **E2E:** RF-001/002, CA-008, CA-015, CA-021, CA-035, CA-038, CA-044, CA-048, CA-062 y CA-065 como mínimos de riesgo.
- **Seguridad:** usuario A no puede consultar/modificar recursos B; pruebas de fuga por filtros, exportación, backup, historial, búsquedas y caché.
- **A11y/visual:** móvil y escritorio; comparar con imagen de referencia respetando reglas seleccionadas, no widgets de muestra descartados.
- **Regresión en CI:** ejecutar tests de dominio + integración + flujos críticos antes de fusionar cambios que alteren contabilidad.
- **Criterios de cierre de fase:** cada RF implementado tiene al menos prueba de caso feliz, error, concurrencia/reintento si monetario, aislamiento y evidencia de UI.

## Cuestiones deliberadamente pendientes de validación

- Compatibilidad del SDK actual de Neon Auth y configuración real de proveedor Google/códigos SMTP.
- Motor preciso de conciliación (propuesta en §6 de modelo), verificable con casos reales y checkpoints.
- Excepciones bancarias inusuales y tratamiento de intereses/beneficios sin inventar clasificaciones.
- Cobertura de conversiones USD/UYU/EUR y coste real de las fuentes/proveedores.
- El cumplimiento de estos criterios se documentará **cuando Codex ejecute pruebas**; aquí están escritos, no ejecutados.
