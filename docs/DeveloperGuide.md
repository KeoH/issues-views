# 💻 Guía del Desarrollador (Angular 21)

Esta guía detalla los aspectos técnicos necesarios para desarrollar, mantener y compilar el proyecto.

---

## 🛠️ Stack Tecnológico

El proyecto está construido sobre un stack moderno que maximiza el rendimiento y minimiza las dependencias externas:

* **Framework**: Angular 21.2.0.
* **Paradigma de Detección de Cambios**: **Zoneless** Change Detection (sin Zone.js, lo que mejora drásticamente el rendimiento de pintado al arrastrar elementos).
* **Gestión de Estado**: Angular **Signals** (`signal`, `computed`, `effect`).
* **Estilos**: Vanilla CSS 3 con variables locales, CSS Grid y Flexbox.
* **Gestor de Paquetes**: **pnpm** (versión 11.7.0).

---

## ⚡ Reactividad con Angular Signals

La aplicación prescinde por completo de observables complejos (`rxjs`) para el control de estado, adoptando en su lugar señales nativas:

```typescript
// Señal mutable de tareas en TimelineService
readonly tasks = signal<Task[]>([]);

// Señal computada para apilamiento en AppComponent
readonly userLayouts = computed(() => {
  const tasks = this.timelineService.tasks();
  // ... lógica de cálculo de pistas ...
  return layouts;
});
```

### Constructor y Sincronización Automática
El servicio `TimelineService` inicializa y sincroniza el estado en LocalStorage mediante bloques `effect` que se ejecutan automáticamente cada vez que se detectan cambios en las señales:

```typescript
constructor() {
  this.loadFromStorage();

  effect(() => {
    localStorage.setItem(this.STORAGE_USERS_KEY, JSON.stringify(this.users()));
  });
  // ... efectos para tasks y projects ...
}
```

---

## 🔄 Ciclos de Vida y ResizeObserver

La capa de conexiones SVG requiere conocer las dimensiones físicas en píxeles del grid del planificador para calcular correctamente las coordenadas de las flechas.

1. **Vinculación**: En el método `ngAfterViewInit` de `App` en [app.ts](file:///Users/fmanzano/Projects/issues-views/src/app/app.ts), se inicializa un `ResizeObserver` sobre el selector `.timeline-row-grid`:
   ```typescript
   ngAfterViewInit() {
     const element = document.querySelector('.timeline-row-grid');
     if (element) {
       this.resizeObserver = new ResizeObserver(entries => {
         for (const entry of entries) {
           this.gridWidth.set(entry.contentRect.width);
         }
       });
       this.resizeObserver.observe(element);
     }
   }
   ```
2. **Desconexión**: En `ngOnDestroy`, se asegura de desconectar el observador para evitar fugas de memoria (*memory leaks*):
   ```typescript
   ngOnDestroy() {
     if (this.resizeObserver) {
       this.resizeObserver.disconnect();
     }
   }
   ```

---

## 🚀 Comandos del Proyecto

Utiliza los siguientes scripts definidos en `package.json` para gestionar el ciclo de vida del proyecto localmente:

### 1. Instalar dependencias
Asegúrate de contar con `pnpm` instalado de forma global en tu máquina:
```bash
pnpm install
```

### 2. Iniciar servidor de desarrollo
Arranca un servidor local interactivo y reconstruye los bundles automáticamente al editar archivos:
```bash
pnpm run start
# O simplemente: pnpm start
```
* Acceso: Abre **[http://localhost:4200](http://localhost:4200)** en tu navegador.

### 3. Compilar para Producción
Optimiza y compila los bundles CSS/JS generados en la carpeta `dist/timeline-mvp`:
```bash
pnpm run build
```
