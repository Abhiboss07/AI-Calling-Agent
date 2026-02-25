"use client";
export const runtime = 'edge';
import KnowledgeBaseForm from '../create/page'; // Reuse the form component

export default function EditKnowledgeBase({ params }) {
    return <KnowledgeBaseForm params={params} />;
}
