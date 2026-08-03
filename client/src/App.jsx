import { useEffect, useState } from 'react';
import { Box, Drawer, Flex, Portal } from '@chakra-ui/react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';

const SIDEBAR_WIDTH = '18rem';

/**
 * The application shell: a persistent sidebar plus topbar, with routed pages rendered
 * into <Outlet />.
 *
 * Below the `lg` breakpoint the sidebar becomes a drawer — the same Sidebar component in
 * both cases, so the course table of contents never has a second implementation to keep
 * in sync.
 */
export default function App() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever navigation happens, otherwise it covers the page
  // the user just chose.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <Flex direction="column" minH="100dvh" bg="bg.canvas" color="fg.default">
      <Topbar onOpenSidebar={() => setDrawerOpen(true)} />

      <Flex flex="1" align="stretch">
        <Box
          as="aside"
          display={{ base: 'none', lg: 'block' }}
          width={SIDEBAR_WIDTH}
          flexShrink={0}
          borderRightWidth="1px"
          borderColor="border.default"
          bg="bg.surface"
          position="sticky"
          top="3.5rem"
          height="calc(100dvh - 3.5rem)"
        >
          <Sidebar />
        </Box>

        <Box as="main" flex="1" minW="0">
          <Outlet />
        </Box>
      </Flex>

      <Drawer.Root
        open={drawerOpen}
        onOpenChange={(event) => setDrawerOpen(event.open)}
        placement="start"
      >
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content maxW={SIDEBAR_WIDTH}>
              <Drawer.Body p="0">
                <Sidebar onNavigate={() => setDrawerOpen(false)} />
              </Drawer.Body>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    </Flex>
  );
}
