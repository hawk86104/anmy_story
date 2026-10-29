import * as migration_20261024_041445_initial from "./20261024_041445_initial";
import * as migration_20261024_041637_editor_audit from "./20261024_041637_editor_audit";
import * as migration_20261024_042609_dependency_update from "./20261024_042609_dependency_update";
import * as migration_20261026_085202_usagi_theme from "./20261026_085202_usagi_theme";
import * as migration_20261028_021906_media_cos_backup from "./20261028_021906_media_cos_backup";
import * as migration_20261029_021636_entry_tag_options from "./20261029_021636_entry_tag_options";

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
  {
    up: migration_20261028_021906_media_cos_backup.up,
    down: migration_20261028_021906_media_cos_backup.down,
    name: "20261028_021906_media_cos_backup",
  },
  {
    up: migration_20261029_021636_entry_tag_options.up,
    down: migration_20261029_021636_entry_tag_options.down,
    name: "20261029_021636_entry_tag_options",
  },
];
