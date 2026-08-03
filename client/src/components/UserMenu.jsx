import { Avatar, Button, Menu, Portal, Text } from '@chakra-ui/react';
import { FiLogIn, FiLogOut } from 'react-icons/fi';
import { useAuth } from '../hooks/useAuth.js';

export function UserMenu() {
  const { isLoading, isAuthenticated, user, login, logout, enabled } = useAuth();

  if (isLoading) return <Button size="sm" variant="ghost" loading />;

  if (!isAuthenticated) {
    return (
      <Button size="sm" colorPalette="brand" onClick={() => login()}>
        <FiLogIn />
        Sign in
      </Button>
    );
  }

  const label = user?.name || user?.email || 'Account';

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button size="sm" variant="ghost" px="2">
          <Avatar.Root size="xs">
            <Avatar.Fallback name={label} />
            {user?.picture && <Avatar.Image src={user.picture} alt="" />}
          </Avatar.Root>
          <Text display={{ base: 'none', md: 'inline' }} maxW="10rem" truncate>
            {label}
          </Text>
        </Button>
      </Menu.Trigger>

      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="14rem">
            <Menu.ItemGroup>
              <Menu.ItemGroupLabel>
                {user?.email || label}
                {/* Makes the unauthenticated dev mode obvious rather than a silent surprise. */}
                {!enabled && ' · dev mode'}
              </Menu.ItemGroupLabel>
            </Menu.ItemGroup>

            {enabled && (
              <>
                <Menu.Separator />
                <Menu.Item value="logout" onSelect={logout} color="red.fg">
                  <FiLogOut />
                  Sign out
                </Menu.Item>
              </>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

export default UserMenu;
