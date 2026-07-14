import * as React from 'react'
import { ChevronDownIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '#/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import { SidebarMenuButton } from '#/components/ui/sidebar.tsx'

const themeOptions = [
  { value: 'system', label: 'System', icon: MonitorIcon },
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
] as const

type ThemeOption = (typeof themeOptions)[number]['value']

function isThemeOption(value: string): value is ThemeOption {
  return themeOptions.some((option) => option.value === value)
}

export function ThemeSwitcher({
  variant = 'icon',
}: {
  variant?: 'icon' | 'sidebar'
}) {
  const [mounted, setMounted] = React.useState(false)
  const { resolvedTheme, setTheme, theme } = useTheme()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const selectedTheme = isThemeOption(theme ?? '') ? theme : 'system'
  const ResolvedThemeIcon =
    mounted && resolvedTheme === 'dark' ? MoonIcon : SunIcon
  const isSidebar = variant === 'sidebar'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          isSidebar ? (
            <SidebarMenuButton tooltip="Theme" aria-label="Change theme" />
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Change theme"
              title="Change theme"
            />
          )
        }
      >
        {mounted ? <ResolvedThemeIcon /> : <MonitorIcon />}
        {isSidebar ? (
          <>
            <span>Theme</span>
            <ChevronDownIcon className="ml-auto" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isSidebar ? 'top' : 'bottom'}
        align={isSidebar ? 'start' : 'end'}
        className="w-40"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={mounted ? selectedTheme : 'system'}
            onValueChange={(value) => {
              if (isThemeOption(value)) {
                setTheme(value)
              }
            }}
          >
            {themeOptions.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <option.icon />
                <span>{option.label}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
