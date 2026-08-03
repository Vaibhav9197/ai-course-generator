import { Box, Heading, HStack, IconButton, Spacer } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { FiMenu } from 'react-icons/fi';
import { ColorModeButton } from './ColorMode.jsx';
import UserMenu from './UserMenu.jsx';

/**
 * Sticky application header. The menu button is the only way to reach navigation on
 * narrow screens, where the sidebar collapses into a drawer.
 */
export function Topbar({ onOpenSidebar }) {
  return (
    <Box
      as="header"
      position="sticky"
      top="0"
      zIndex="docked"
      bg="bg.surface"
      borderBottomWidth="1px"
      borderColor="border.default"
      px={{ base: '3', md: '6' }}
      py="3"
    >
      <HStack>
        <IconButton
          aria-label="Open navigation"
          variant="ghost"
          size="sm"
          display={{ base: 'inline-flex', lg: 'none' }}
          onClick={onOpenSidebar}
        >
          <FiMenu />
        </IconButton>

        <Heading size="md" asChild>
          <Link to="/">Text-to-Learn</Link>
        </Heading>

        <Spacer />

        <ColorModeButton />
        <UserMenu />
      </HStack>
    </Box>
  );
}

export default Topbar;
