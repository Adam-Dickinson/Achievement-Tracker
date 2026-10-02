export interface LogsFolderActions {
  readonly makeFolder: (dir: string) => Promise<unknown>
  readonly openPath: (dir: string) => Promise<string>
}

export async function openLogsFolder(dir: string, actions: LogsFolderActions): Promise<void> {
  await actions.makeFolder(dir)
  const problem = await actions.openPath(dir)
  if (problem !== '') throw new Error(problem)
}
