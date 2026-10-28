import DefaultTheme from "vitepress/theme";
import type {Theme} from "vitepress";
import "./custom.css";

export default {
    extends: DefaultTheme,
    enhanceApp({app}) {
        app.mixin({
            mounted() {
                if (this.$parent === null) {
                    document.documentElement.dataset.docSyncHydrated = "true";
                    window.dispatchEvent(new Event("doc-sync:hydrated"));
                }
            },
        });
    },
} satisfies Theme;
