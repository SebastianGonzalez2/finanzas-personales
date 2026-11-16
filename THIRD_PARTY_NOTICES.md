# Componentes de terceros

F0-04 Google-only usa Better Auth 1.7.18 y Kysely 0.29.8, ambos MIT.
Kysely es el adaptador SQL incorporado de Better Auth, con esquema y transacción
explícitos; no reemplaza el SQL financiero F0-05. Las licencias completas están
en sus paquetes y las versiones exactas en package-lock.json.

F0-NEON usa `pg` 8.23.1 (MIT), ya utilizado por CI y ahora disponible para
la conexión de desarrollo, `@types/pg` 8.23.1 (MIT, solo desarrollo) y
`server-only` 0.0.1 (MIT, impide importar el adaptador en un Client Component).
Las licencias completas se conservan en los paquetes instalados y el lockfile.

Card procede del registro oficial shadcn/ui (new-york-v4).
Fuente: https://ui.shadcn.com/r/styles/new-york-v4/card.json
Adaptación local: import de cn desde @/lib/utils y formato Prettier.

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

La identidad visual Glaciar (UI-02 en adelante, sin dependencias npm nuevas)
carga mediante `next/font/google` la tipografía Plus Jakarta Sans, bajo SIL
Open Font License 1.1 (https://openfontlicense.org). Next.js la descarga en la
compilación y la sirve desde el propio dominio; no hay solicitudes a Google en
tiempo de uso. (El laboratorio UI-01 de `/prototipos/ui`, que además cargaba
Geist e Instrument Serif, se retiró en UI-06.)
