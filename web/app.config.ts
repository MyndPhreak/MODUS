// @ts-nocheck
export default defineAppConfig({
  ui: {
    // Global card styling with glassmorphism
    card: {
      base: "glass-card rounded-2xl overflow-hidden",
      background: "",
      ring: "",
      divide: "",
      rounded: "rounded-2xl",
      shadow: "shadow-glass",
      body: {
        base: "p-6",
        padding: "p-6 sm:p-6",
      },
      header: {
        base: "p-6 pb-4",
        padding: "p-6 pb-4 sm:px-6",
      },
      footer: {
        base: "p-6 pt-4",
        padding: "p-6 pt-4 sm:px-6",
      },
    },

    // Button styling
    button: {
      default: {
        size: "md",
        variant: "soft",
        color: "primary",
      },
      rounded: "rounded-xl",
      font: "font-medium",
      padding: {
        "2xs": "px-2 py-1",
        xs: "px-3 py-1.5",
        sm: "px-4 py-2",
        md: "px-5 py-2.5",
        lg: "px-6 py-3",
        xl: "px-7 py-3.5",
      },
    },

    // Badge styling
    badge: {
      rounded: "rounded-lg",
      font: "font-semibold",
      size: {
        xs: "text-xs px-2 py-0.5",
        sm: "text-xs px-2.5 py-1",
        md: "text-sm px-3 py-1",
        lg: "text-sm px-3.5 py-1.5",
      },
    },

    // Avatar styling
    avatar: {
      rounded: "rounded-full",
      size: {
        "3xs": "h-6 w-6",
        "2xs": "h-8 w-8",
        xs: "h-10 w-10",
        sm: "h-12 w-12",
        md: "h-16 w-16",
        lg: "h-20 w-20",
        xl: "h-24 w-24",
        "2xl": "h-32 w-32",
        "3xl": "h-40 w-40",
      },
    },

    // Slideover (for logs panel)
    slideover: {
      background: "bg-white dark:bg-gray-900",
      ring: "",
      rounded: "",
      padding: "",
      shadow: "shadow-2xl",
      width: "max-w-2xl",
      overlay: {
        background: "bg-gray-900/75 backdrop-blur-sm",
      },
    },

    // Input styling
    input: {
      rounded: "rounded-xl",
      padding: {
        "2xs": "px-2 py-1",
        xs: "px-2.5 py-1.5",
        sm: "px-3 py-2",
        md: "px-3.5 py-2.5",
        lg: "px-4 py-3",
        xl: "px-4.5 py-3.5",
      },
    },

    // Notifications
    notifications: {
      position: "top-0 right-0",
    },

    notification: {
      rounded: "rounded-xl",
      padding: "p-4",
      ring: "",
      shadow: "shadow-glass",
    },

    // Progress bar
    progress: {
      rounded: "rounded-full",
      ring: "",
      background: "bg-glass-200",
      indicator: {
        rounded: "rounded-full",
      },
    },

    // Modal
    modal: {
      rounded: "rounded-2xl",
      shadow: "shadow-glass-lg",
      background: "bg-white dark:bg-gray-900",
      ring: "",
      padding: "",
      overlay: {
        background: "bg-gray-900/75 backdrop-blur-md",
      },
    },

    // Primary color customization
    primary: "purple",
    gray: "neutral",
  },
});
