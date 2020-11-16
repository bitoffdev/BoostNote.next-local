import React, { useState, useEffect, useCallback } from 'react'
import Router from './Router'
import { ThemeProvider } from 'styled-components'
import { useDb } from '../lib/db'
import PreferencesModal from './PreferencesModal/PreferencesModal'
import { usePreferences } from '../lib/preferences'
import '../lib/i18n'
import CodeMirrorStyle from './CodeMirrorStyle'
import { useEffectOnce } from 'react-use'
import { useRouter } from '../lib/router'
import { values, keys, prependNoteIdPrefix, size } from '../lib/db/utils'
import { useActiveStorageId } from '../lib/routeParams'
import {
  addIpcListener,
  removeIpcListener,
  setCookie,
} from '../lib/electronOnly'
import { useGeneralStatus } from '../lib/generalStatus'
import { getNoteFullItemId } from '../lib/nav'
import { useBoostNoteProtocol } from '../lib/protocol'
import {
  useBoostHub,
  getBoostHubTeamIconUrl,
  getLegacySessionCookie,
  getDesktopAccessTokenFromSessionKey,
  flushLegacySessionCookie,
  boostHubBaseUrl,
} from '../lib/boosthub'
import {
  boostHubTeamCreateEventEmitter,
  BoostHubTeamCreateEvent,
  BoostHubTeamUpdateEvent,
  boostHubTeamUpdateEventEmitter,
  BoostHubTeamDeleteEvent,
  boostHubTeamDeleteEventEmitter,
  boostHubAccountDeleteEventEmitter,
  boostHubToggleSettingsEventEmitter,
  boostHubLoginRequestEventEmitter,
  boostHubCreateLocalSpaceEventEmitter,
} from '../lib/events'
import { useRouteParams } from '../lib/routeParams'
import { useCreateWorkspaceModal } from '../lib/createWorkspaceModal'
import CreateWorkspaceModal from './organisms/CreateWorkspaceModal'
import { IpcRendererEvent } from 'electron/renderer'
import { useToast } from '../lib/toast'
import { useStorageRouter } from '../lib/storageRouter'
import ExternalStyle from './ExternalStyle'
import { selectV2Theme } from '../shared/lib/styled/styleFunctions'
import Modal from '../shared/components/organisms/Modal'
import GlobalStyle from '../shared/components/atoms/GlobalStyle'
import Dialog from '../shared/components/organisms/Dialog/Dialog'
import ContextMenu from '../shared/components/molecules/ContextMenu'
import AppNavigator from './organisms/AppNavigator'
import Toast from '../shared/components/organisms/Toast'
import styled from '../shared/lib/styled'
import { useToast } from '../shared/lib/stores/toast'

const LoadingText = styled.div`
  margin: 30px;
`

const AppContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  display: flex;
`

const App = () => {
  const {
    initialize,
    queueSyncingAllStorage,
    storageMap,
    getNotePathname,
    getUninitializedStorageData,
  } = useDb()
  const { push, pathname, replace } = useRouter()
  const [initialized, setInitialized] = useState(false)
  const { setGeneralStatus, generalStatus } = useGeneralStatus()
  const {
    togglePreferencesModal,
    preferences,
    setPreferences,
  } = usePreferences()
  const { navigate: navigateToStorage } = useStorageRouter()
  const { messageBox } = useDialog()
  const { pushMessage } = useToast()
  const { fetchDesktopGlobalData } = useBoostHub()
  const routeParams = useRouteParams()
  const { navigate: navigateToStorage } = useStorageRouter()
  const activeStorageId = useActiveStorageId()

  useEffectOnce(() => {
    initialize()
      .then(async (storageMap) => {
        const localSpaces = values(storageMap)

        if (
          pathname === '' ||
          pathname === '/' ||
          pathname === '/app' ||
          pathname === '/app/storages'
        ) {
          if (localSpaces.length > 0) {
            push(`/app/storages/${localSpaces[0].id}`)
          } else {
            push('/app/storages')
          }
        }
        setInitialized(true)

        // notify on failed initializations
        const uninitializedStorageData = await getUninitializedStorageData()
        if (uninitializedStorageData.length > 0) {
          pushMessage({
            title: 'Error',
            description: `Failed to initialize some storages, please check console for more info.`,
          })
        }
      })
      .catch((error) => {
        pushMessage({
          title: 'Error',
          description: `Failed to initialize some storages, please check console for more info.`,
        })
        console.error(error)
      })
  })

  useEffect(() => {
    const noteLinkNavigateEventHandler = (
      _: IpcRendererEvent,
      noteHref: string
    ) => {
      const noteId = Array.isArray(noteHref) ? noteHref[0] : noteHref
      if (!activeStorageId) {
        pushMessage({
          title: 'Invalid navigation!',
          description: 'Cannot open note link without storage information.',
        })
      } else {
        getNotePathname(activeStorageId, prependNoteIdPrefix(noteId)).then(
          (pathname) => {
            if (pathname) {
              replace(getNoteFullItemId(activeStorageId, pathname, noteId))
            } else {
              pushMessage({
                title: 'Note link invalid!',
                description:
                  'The note link you are trying to open is invalid or from another storage.',
              })
            }
          }
        )
      }
    }
    addIpcListener('note:navigate', noteLinkNavigateEventHandler)
    return () => {
      removeIpcListener('note:navigate', noteLinkNavigateEventHandler)
    }
  }, [activeStorageId, getNotePathname, pushMessage, replace])

  const boostHubTeamsShowPageIsActive =
    routeParams.name === 'boosthub.teams.show'

  useEffect(() => {
    const preferencesIpcEventHandler = () => {
      togglePreferencesModal()
    }
    addIpcListener('preferences', preferencesIpcEventHandler)

    const createLocalSpaceHandler = () => {
      push('/app/storages')
    }
    addIpcListener('create-local-space', createLocalSpaceHandler)

    return () => {
      removeIpcListener('preferences', preferencesIpcEventHandler)
      removeIpcListener('create-local-space', createLocalSpaceHandler)
    }
  }, [togglePreferencesModal, push])

  const switchWorkspaceHandler = useCallback(
    (_event: any, index: number) => {
      const storageIds = keys(storageMap)

      const targetStorageId = storageIds[index]
      const spaceCount = size(storageMap)
      if (index >= spaceCount) {
        pushMessage({
          title: 'No such space.',
          description: `You selected ${index + 1}${
            index == 0 ? 'st' : index == 1 ? 'nd' : 'th'
          } space but only ${spaceCount} space${spaceCount == 1 ? '' : 's'} ${
            spaceCount > 1 ? 'are' : 'is'
          } available. Please add more spaces or switch to existing ones. `,
        })
      } else {
        navigateToStorage(targetStorageId)
      }
    },
    [storageMap, navigateToStorage, pushMessage]
  )

  useEffect(() => {
    addIpcListener('switch-workspace', switchWorkspaceHandler)
    return () => {
      removeIpcListener('switch-workspace', switchWorkspaceHandler)
    }
  }, [switchWorkspaceHandler])

  useBoostNoteProtocol()

  return (
    <ThemeProvider theme={selectV2Theme(preferences['general.theme'] as any)}>
      <AppContainer
        onDrop={(event: React.DragEvent) => {
          event.preventDefault()
        }}
      >
        {initialized ? (
          <>
            <AppNavigator />
            <Router />
          </>
        ) : (
          <LoadingText>Loading Data...</LoadingText>
        )}
        <GlobalStyle />
        <CodeMirrorStyle />
        <ExternalStyle />

        <Toast />
        <PreferencesModal />
        <ContextMenu />

        <Dialog />
        <Modal />
      </AppContainer>
    </ThemeProvider>
  )
}

export default App
