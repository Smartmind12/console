import { useRouter } from "next/router";
import {
  PageBase,
  PipelineListPageMainView,
  Topbar,
} from "@instill-ai/toolkit";
import { Logo } from "@instill-ai/design-system";

import { Sidebar, ConsoleCorePageHead } from "../../../components";
import { NextPageWithLayout } from "../../_app";
import { useAccessToken } from "../../../lib/useAccessToken";

const PipelinePage: NextPageWithLayout = () => {
  const router = useRouter();
  const accessToken = useAccessToken();
  return (
    <>
      <ConsoleCorePageHead title="pipelines" />
      <PipelineListPageMainView
        router={router}
        accessToken={accessToken.isSuccess ? accessToken.data : null}
        enableQuery={accessToken.isSuccess}
      />
    </>
  );
};

PipelinePage.getLayout = (page) => {
  return (
    <PageBase>
      <Topbar logo={<Logo variant="colourLogomark" width={38} />} />
      <PageBase.Container>
        <Sidebar />
        <PageBase.Content contentPadding="p-8">{page}</PageBase.Content>
      </PageBase.Container>
    </PageBase>
  );
};

export default PipelinePage;
