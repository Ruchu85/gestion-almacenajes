"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, LogOut, User, Settings, Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { EnvSwitcher } from "@/components/shared/env-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface HeaderProps {
  userEmail?: string;
  userName?: string;
  userRole?: string;
}

export function Header({ userEmail, userName, userRole }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const initials = userName
    ? userName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : userEmail?.[0]?.toUpperCase() ?? "U";

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast({ title: "Sesión cerrada", description: "Hasta pronto." });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card/95 backdrop-blur-sm px-6 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-muted-foreground">
          <Warehouse className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium">Gestión de Almacenajes</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <EnvSwitcher />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Cambiar tema"
          className="hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-9 w-9 rounded-full hover:ring-2 hover:ring-violet-500/30 transition-all"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1.5">
                <p className="text-sm font-semibold leading-none">
                  {userName ?? "Usuario"}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {userEmail}
                </p>
                {userRole && (
                  <Badge
                    variant="outline"
                    className="w-fit text-[10px] py-0 px-1.5 mt-0.5"
                  >
                    {userRole === "admin" ? "Administrador" : "Usuario"}
                  </Badge>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="hover:bg-violet-500/8 hover:text-violet-600 dark:hover:text-violet-400 cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              <span>Perfil</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-violet-500/8 hover:text-violet-600 dark:hover:text-violet-400 cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Configuración</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Cerrar sesión</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
