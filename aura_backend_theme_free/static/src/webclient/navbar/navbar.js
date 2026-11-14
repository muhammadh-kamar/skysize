/** @odoo-module **/
/**
 * Aura Backend Theme - Free — NavBar patch
 *
 * Adds to the stock Odoo NavBar:
 *   1. Mobile off-canvas drawer  (hamburger open/close + backdrop)
 *   2. Sidebar quick links        (apps, settings, profile)
 *   3. Collapsible sidebar rail   (260px expanded <-> 72px collapsed)
 *   4. Dark Mode system           (instant toggle + localStorage persistence)
 *   5. Configurable vector icons  (Monochrome Lucide SVG vs Default App Icons)
 *   6. Top sub-menu strip         (current app sections)
 */

import { patch }      from '@web/core/utils/patch';
import { browser }    from '@web/core/browser/browser';
import { user }       from '@web/core/user';
import { session }    from '@web/session';
import { NavBar }     from '@web/webclient/navbar/navbar';
import {
    onMounted,
    onPatched,
    onWillUnmount,
    useRef,
    useState,
} from '@odoo/owl';

// ─── LocalStorage Keys ───────────────────────────────────────────────────────
const STORAGE_SIDEBAR_COLLAPSED = 'tbt_sidebar_collapsed';
const STORAGE_DARK_MODE         = 'tbt_dark_mode';
const STORAGE_MONOCHROME_ICONS  = 'tbt_monochrome_icons';

// ─── Apps that should NOT show a sub-nav tree in the sidebar ─────────────────
const NO_SUBNAV_XMLIDS = new Set([
    'spreadsheet_dashboard.spreadsheet_dashboard_menu_root',
]);

// ─── App Icon Vector Mapping (Lucide SVGs) ────────────────────────────────────
const APP_ICON_MAP = {
    // CRM
    'crm': 'crm.svg',
    'crm.crm_menu_root': 'crm.svg',
    // Sales
    'sale': 'sales.svg',
    'sale.sale_menu_root': 'sales.svg',
    'sales': 'sales.svg',
    // Accounting / Invoicing
    'account': 'accounting.svg',
    'account.menu_finance': 'accounting.svg',
    'accounting': 'accounting.svg',
    'invoicing': 'accounting.svg',
    // Purchase
    'purchase': 'purchase.svg',
    'purchase.menu_purchase_root': 'purchase.svg',
    // Stock / Inventory
    'stock': 'inventory.svg',
    'stock.menu_stock_root': 'inventory.svg',
    'inventory': 'inventory.svg',
    // MRP / Manufacturing
    'mrp': 'mrp.svg',
    'mrp.menu_mrp_root': 'mrp.svg',
    'manufacturing': 'mrp.svg',
    // Project
    'project': 'project.svg',
    'project.menu_main_pm': 'project.svg',
    // Mail / Discuss
    'mail': 'discuss.svg',
    'mail.menu_root_discuss': 'discuss.svg',
    'discuss': 'discuss.svg',
    // Contacts
    'contacts': 'contacts.svg',
    'contacts.menu_contacts': 'contacts.svg',
    // Calendar
    'calendar': 'calendar.svg',
    'calendar.mail_menu_calendar': 'calendar.svg',
    // Point of Sale
    'point_of_sale': 'point_of_sale.svg',
    'point_of_sale.menu_point_root': 'point_of_sale.svg',
    // Maintenance
    'maintenance': 'maintenance.svg',
    'maintenance.menu_m_reports': 'maintenance.svg',
    // Website
    'website': 'website.svg',
    'website.menu_website_configuration': 'website.svg',
    // HR / Employees
    'hr': 'hr.svg',
    'hr.menu_hr_root': 'hr.svg',
    'employees': 'hr.svg',
    // Attendances
    'hr_attendance': 'hr_attendance.svg',
    'hr_attendance.menu_hr_attendance_root': 'hr_attendance.svg',
    'attendances': 'hr_attendance.svg',
    // Recruitment
    'hr_recruitment': 'hr_recruitment.svg',
    'hr_recruitment.menu_hr_recruitment_root': 'hr_recruitment.svg',
    'recruitment': 'hr_recruitment.svg',
    // Holidays / Time Off
    'hr_holidays': 'hr_holidays.svg',
    'hr_holidays.menu_hr_holidays_root': 'hr_holidays.svg',
    'time off': 'hr_holidays.svg',
    // Fleet
    'fleet': 'fleet.svg',
    'fleet.menu_root': 'fleet.svg',
    // Documents
    'documents': 'documents.svg',
    'documents.menu_root': 'documents.svg',
    // Spreadsheets / Dashboards
    'spreadsheet_dashboard': 'spreadsheet_dashboard.svg',
    'spreadsheet_dashboard.spreadsheet_dashboard_menu_root': 'spreadsheet_dashboard.svg',
    'dashboards': 'spreadsheet_dashboard.svg',
    // Apps
    'apps': 'apps.svg',
    'base.menu_management': 'apps.svg',
    // Settings
    'settings': 'settings.svg',
    'base.menu_administration': 'settings.svg',
};

function resolveAppIconSvg(app) {
    if (!app) return null;
    const xmlid  = (app.xmlid || '').toLowerCase();
    const name   = (app.name || '').toLowerCase().trim();
    const module = xmlid.split('.')[0] || '';

    const svg = APP_ICON_MAP[xmlid] || APP_ICON_MAP[module] || APP_ICON_MAP[name];
    if (svg) {
        return `/aura_backend_theme_free/static/src/img/${svg}`;
    }
    return null;
}

function buildMenuHref(menu) {
    if (!menu || (!menu.actionPath && !menu.actionID)) return '';
    return `/odoo/${menu.actionPath || `action-${menu.actionID}`}`;
}

function findMenuPathById(tree, targetId, acc = []) {
    if (!tree) return null;
    const next = [...acc, tree];
    if (tree.id === targetId) {
        return next;
    }
    for (const child of tree.childrenTree || []) {
        const found = findMenuPathById(child, targetId, next);
        if (found) {
            return found;
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
patch(NavBar.prototype, {
    setup() {
        super.setup();

        this.menuService   = this.env.services.menu;
        this.actionService = this.env.services.action;
        this.tbtUser       = user;

        // ── 1. Mobile off-canvas sidebar ─────────────────────────────────────
        this.mobileSidebarState = useState({ isOpen: false });
        this.toggleMobileSidebar = () => {
            this.mobileSidebarState.isOpen = !this.mobileSidebarState.isOpen;
        };
        this.closeMobileSidebar = () => {
            this.mobileSidebarState.isOpen = false;
        };

        // ── 2. Collapsible sidebar rail (desktop >=992px) ────────────────────
        this.sidebarState = useState({ collapsed: false });
        this._applySidebarClass = () => {
            const isCol = this.sidebarState.collapsed;
            document.querySelector('.o_web_client')?.classList.toggle('tbt_sidebar_collapsed', isCol);
            document.documentElement.classList.toggle('tbt_sidebar_collapsed', isCol);
        };
        this.toggleSidebarCollapse = () => {
            this.sidebarState.collapsed = !this.sidebarState.collapsed;
            this._applySidebarClass();
            try {
                browser.localStorage.setItem(STORAGE_SIDEBAR_COLLAPSED, this.sidebarState.collapsed ? '1' : '0');
            } catch (_) {}
        };
        this.getSidebarToggleTitle = () =>
            this.sidebarState.collapsed ? 'Expand Sidebar' : 'Collapse Sidebar';

        // ── 3. Dark Mode system (Preference driven) ──────────────────────────
        let initialDark = false;
        if (session && session.dark_mode) {
            initialDark = session.dark_mode === 'dark';
        } else {
            try {
                const darkVal = browser.localStorage.getItem(STORAGE_DARK_MODE);
                initialDark = (darkVal === '1') || document.documentElement.classList.contains('tbt-dark-mode');
            } catch (_) {}
        }
        this.darkModeState = useState({ isDark: initialDark });
        try {
            browser.localStorage.setItem(STORAGE_DARK_MODE, initialDark ? '1' : '0');
        } catch (_) {}

        this._applyDarkModeClass = () => {
            const isDark = this.darkModeState.isDark;
            document.documentElement.classList.toggle('tbt-dark-mode', isDark);
            document.body?.classList.toggle('tbt-dark-mode', isDark);
            document.querySelector('.o_web_client')?.classList.toggle('tbt-dark-mode', isDark);
        };
        this._applyDarkModeClass();

        // ── 4. App Icon theme (Preference driven) ───────────────────────────
        let initialMono = true;
        if (session && session.app_icon) {
            initialMono = session.app_icon === 'monochrome';
        } else {
            try {
                const monoVal = browser.localStorage.getItem(STORAGE_MONOCHROME_ICONS);
                initialMono = monoVal === null ? true : monoVal === '1';
            } catch (_) {}
        }
        this.iconThemeState = useState({ monochrome: initialMono });
        try {
            browser.localStorage.setItem(STORAGE_MONOCHROME_ICONS, initialMono ? '1' : '0');
        } catch (_) {}

        this.isMonochromeIcon = (app) => {
            return this.iconThemeState.monochrome && !!resolveAppIconSvg(app);
        };

        // ── 5. Top submenu strip ──────────────────────────────────────────────
        this.topSubmenuState = useState({ openSectionId: null, openSubItemId: null, panelLeft: 0 });
        this.topSubmenuRef = useRef('topSubmenu');
        this.isTopSectionOpen = (sectionId) =>
            this.topSubmenuState.openSectionId === sectionId;
        this.getOpenTopSection = () =>
            this.currentAppSections.find(s => s.id === this.topSubmenuState.openSectionId) || null;
        this.toggleTopSection = (section, ev) => {
            const nextId = section?.id;
            const closing = this.topSubmenuState.openSectionId === nextId;
            this.topSubmenuState.openSectionId = closing ? null : nextId;
            this.topSubmenuState.openSubItemId = null;
            if (!closing && ev?.currentTarget) {
                const bar = this.topSubmenuRef.el;
                const btn = ev.currentTarget;
                const barRect = bar.getBoundingClientRect();
                const btnRect = btn.getBoundingClientRect();
                this.topSubmenuState.panelLeft = btnRect.left - barRect.left;
            }
        };
        this.isSubItemOpen = (itemId) =>
            this.topSubmenuState.openSubItemId === itemId;
        this.toggleSubItem = (item) => {
            const nextId = item?.id;
            this.topSubmenuState.openSubItemId =
                this.topSubmenuState.openSubItemId === nextId ? null : nextId;
        };
        this.onTopSubmenuItemSelection = (menu) => {
            this.topSubmenuState.openSectionId = null;
            this.topSubmenuState.openSubItemId = null;
            this.onNavBarDropdownItemSelection(menu);
        };
        this.onTopSectionLeafClick = (section) => {
            this.topSubmenuState.openSectionId = null;
            this.topSubmenuState.openSubItemId = null;
            this.onNavBarDropdownItemSelection(section);
        };

        // ── 6. Logo / company helpers ─────────────────────────────────────────
        this.getCompanyLogo = () => {
            const id = this.currentCompany?.id || '';
            return `/web/binary/company_logo?company=${id}`;
        };
        this.getUserAvatarUrl = () => {
            const userId = this.tbtUser?.userId;
            return userId
                ? `/web/image?model=res.users&id=${userId}&field=avatar_128`
                : '/web/static/img/default_icon_app.png';
        };
        this.onLogoClick = () => {
            browser.location.href = '/odoo/dashboards';
        };
        this.openMyProfile = () => {
            this.actionService.doAction('base.action_res_users_my');
        };

        this.getTopbarAppName = () => {
            const app = this.currentApp;
            return app?.name || '';
        };

        // ── 7. App helpers & Icon resolver ────────────────────────────────────
        this.isAppWithoutSubnav = () =>
            NO_SUBNAV_XMLIDS.has(this.currentApp?.xmlid);

        this.getApps = () => {
            return this.menuService.getApps().filter(a =>
                a.xmlid !== 'base.menu_administration' &&
                a.xmlid !== 'base.menu_management'
            );
        };
        this.getSettingsApp = () =>
            this.menuService.getApps()
                .find(a => a.xmlid === 'base.menu_administration' || a.name === 'Settings');
        this.getAppsApp = () =>
            this.menuService.getApps()
                .find(a =>
                    a.xmlid === 'base.menu_management' ||
                    a.xmlid === 'base.menu_apps' ||
                    a.name === 'Apps'
                );

        this.openAppsMenu = () => {
            const apps = this.getAppsApp();
            if (apps) {
                this.onNavBarDropdownItemSelection(apps);
                return;
            }
            browser.location.href = '/odoo/apps/modules';
        };

        this.openSettingsMenu = () => {
            const settings = this.getSettingsApp();
            if (settings) {
                this.onNavBarDropdownItemSelection(settings);
                return;
            }
            browser.location.href = '/odoo/settings';
        };

        // Resolve an app's icon: respects configurable monochrome mode, falls back to webIconData
        this.getAppIcon = (app) => {
            if (!app) return '/web/static/img/default_icon_app.png';
            if (this.iconThemeState.monochrome) {
                const svg = resolveAppIconSvg(app);
                if (svg) return svg;
            }
            const data = app.webIconData;
            if (data) {
                if (data.startsWith('data:image') || data.startsWith('/')) return data;
                const prefix = data.startsWith('P')
                    ? 'data:image/svg+xml;base64,'
                    : 'data:image/png;base64,';
                return prefix + data.replace(/\s/g, '');
            }
            return '/web/static/img/default_icon_app.png';
        };

        // ── 8. Overflow tracking for the sidebar scroll area ──────────────────
        this.sidebarScrollRef  = useRef('sidebarScroll');
        this._updateOverflow   = () => {
            const el = this.sidebarScrollRef?.el;
            if (!el) return;
            el.parentElement?.classList.toggle(
                'tbt_sidebar_overflowing',
                el.scrollHeight > el.clientHeight + 1
            );
        };

        // Close top submenu on outside click or Escape
        this._onDocumentClick = (ev) => {
            const submenu = this.topSubmenuRef?.el;
            if (this.topSubmenuState.openSectionId && submenu && !submenu.contains(ev.target)) {
                this.topSubmenuState.openSectionId = null;
            }
        };
        this._onDocumentKeydown = (ev) => {
            if (ev.key === 'Escape' && this.topSubmenuState.openSectionId) {
                this.topSubmenuState.openSectionId = null;
            }
        };

        // ── Lifecycle ──────────────────────────────────────────────────────────
        onMounted(() => {
            // Restore persistent states
            try {
                this.sidebarState.collapsed = browser.localStorage.getItem(STORAGE_SIDEBAR_COLLAPSED) === '1';
            } catch (_) {}
            if (session && session.dark_mode) {
                this.darkModeState.isDark = session.dark_mode === 'dark';
            } else {
                try {
                    const darkVal = browser.localStorage.getItem(STORAGE_DARK_MODE);
                    this.darkModeState.isDark = (darkVal === '1') || document.documentElement.classList.contains('tbt-dark-mode');
                } catch (_) {}
            }
            if (session && session.app_icon) {
                this.iconThemeState.monochrome = session.app_icon === 'monochrome';
            } else {
                try {
                    const monoVal = browser.localStorage.getItem(STORAGE_MONOCHROME_ICONS);
                    this.iconThemeState.monochrome = monoVal === null ? true : monoVal === '1';
                } catch (_) {}
            }
            try {
                browser.localStorage.setItem(STORAGE_DARK_MODE, this.darkModeState.isDark ? '1' : '0');
                browser.localStorage.setItem(STORAGE_MONOCHROME_ICONS, this.iconThemeState.monochrome ? '1' : '0');
            } catch (_) {}

            this._applySidebarClass();
            this._applyDarkModeClass();
            this._updateOverflow();

            document.addEventListener('click',   this._onDocumentClick);
            document.addEventListener('keydown', this._onDocumentKeydown);
            window.addEventListener('resize',    this._updateOverflow);
        });

        onPatched(() => {
            this._updateOverflow();
            if (this.topSubmenuState.openSectionId && !this.getOpenTopSection()) {
                this.topSubmenuState.openSectionId = null;
            }
        });

        onWillUnmount(() => {
            document.removeEventListener('click',   this._onDocumentClick);
            document.removeEventListener('keydown', this._onDocumentKeydown);
            window.removeEventListener('resize',    this._updateOverflow);
        });
    },

    // ── Computed ───────────────────────────────────────────────────────────────

    get currentCompany() {
        return user.activeCompany;
    },
});
