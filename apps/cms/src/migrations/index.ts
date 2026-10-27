import * as migration_20261024_041445_initial from "./20261024_041445_initial";
import * as migration_20261024_041637_editor_audit from "./20261024_041637_editor_audit";
import * as migration_20261024_042609_dependency_update from "./20261024_042609_dependency_update";
import * as migration_20261026_085202_usagi_theme from "./20261026_085202_usagi_theme";

export const migrations = [
  {
    up: migration_20261024_041445_initial.up,
    down: migration_20261024_041445_initial.down,
    name: "20261024_041445_initial",
  },
  {
    up: migration_20261024_041637_editor_audit.up,
    down: migration_20261024_041637_editor_audit.down,
    name: "20261024_041637_editor_audit",
  },
  {
    up: migration_20261024_042609_dependency_update.up,
    down: migration_20261024_042609_dependency_update.down,
    name: "20261024_042609_dependency_update",
  },
  {
    up: migration_20261026_085202_usagi_theme.up,
    down: migration_20261026_085202_usagi_theme.down,
    name: "20261026_085202_usagi_theme",
  },
];
