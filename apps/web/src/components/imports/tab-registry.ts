import {
  CheckSquare, Eye, FileSpreadsheet, LayoutDashboard, Link2, Scale, TriangleAlert,
} from 'lucide-react';
import { PERMISSIONS } from '@elbakri/shared';
import type { TabDefinition } from '@/components/layout/tabs';
import type { ImportTabContext } from './types';
import { ImportOverviewTab } from './tabs/overview-tab';
import { ImportFileTab } from './tabs/file-tab';
import { ImportMappingTab } from './tabs/mapping-tab';
import { ImportMatchingTab } from './tabs/matching-tab';
import { ImportIssuesTab } from './tabs/issues-tab';
import { ImportPreviewTab } from './tabs/preview-tab';
import { ImportReconciliationTab } from './tabs/reconciliation-tab';

/** Statuses where the workbook has been read and its analysis is available. */
const ANALYSED = new Set(['ANALYZED', 'MAPPING', 'PREVIEWED', 'APPLYING', 'APPLIED']);

/**
 * The import workflow, as tabs.
 *
 * These are the real stages of bringing a workbook in, not decorative sections.
 * A stage that cannot be used yet is rendered disabled *with the reason* — a
 * mysteriously greyed-out tab leaves someone unable to tell whether it is
 * broken, forbidden, or waiting on something they could do.
 */
export const IMPORT_TABS: TabDefinition<ImportTabContext>[] = [
  {
    key: 'overview',
    label: (t) => t.imports.steps.overview,
    icon: LayoutDashboard,
    content: ImportOverviewTab,
  },
  {
    key: 'file',
    label: (t) => t.imports.steps.file,
    icon: FileSpreadsheet,
    count: (c) => c.run.sheets.length,
    content: ImportFileTab,
  },
  {
    key: 'mapping',
    label: (t) => t.imports.steps.map,
    icon: Link2,
    unavailable: (c, t) =>
      ANALYSED.has(c.run.status) ? null : t.imports.availableAfterAnalysis,
    content: ImportMappingTab,
  },
  {
    key: 'matching',
    label: (t) => t.imports.steps.matching,
    icon: CheckSquare,
    permissions: [PERMISSIONS.MASTER_DATA_READ],
    helpKey: 'field.matchConfidence',
    unavailable: (c, t) =>
      ANALYSED.has(c.run.status) ? null : t.imports.availableAfterAnalysis,
    content: ImportMatchingTab,
  },
  {
    key: 'issues',
    label: (t) => t.imports.steps.issues,
    icon: TriangleAlert,
    count: (c) => c.run._count.issues,
    content: ImportIssuesTab,
  },
  {
    key: 'preview',
    label: (t) => t.imports.steps.preview,
    icon: Eye,
    unavailable: (c, t) =>
      ANALYSED.has(c.run.status) ? null : t.imports.previewAfterAnalysis,
    content: ImportPreviewTab,
  },
  {
    key: 'reconciliation',
    label: (t) => t.imports.steps.reconcile,
    icon: Scale,
    unavailable: (c, t) =>
      c.run.reconciliation ? null : t.imports.reconciliationAfterAnalysis,
    content: ImportReconciliationTab,
  },
];
